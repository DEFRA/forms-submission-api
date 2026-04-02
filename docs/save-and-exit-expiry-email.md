# Save and Exit Expiry Reminder Emails

## Overview

When a user saves their form progress using the "save and exit" feature, a record is created in MongoDB with a time-to-live (TTL). Before that record expires and the user's saved progress is permanently deleted, this feature sends them a reminder email giving them a chance to resume their form.

The feature runs as a scheduled cron job within the service. It queries MongoDB for records that are approaching expiry, locks each one to prevent duplicate emails (important when multiple service instances are running), sends the reminder via GOV.UK Notify, and then marks the record as notified.

## How it works

### Scheduling

On server startup, the scheduler plugin registers a cron job that periodically calls the expiry email processing logic. The cron job runs in UTC and uses the `node-cron` library. It is configured with `noOverlap: true`, which means if a previous run is still in progress when the next scheduled time arrives, the new run is skipped.

The scheduler is started automatically when the server starts and stopped cleanly when the server shuts down.

### Record selection

When the cron job fires, it queries MongoDB for save-and-exit records that meet **all** of the following criteria:

1. **Not consumed** - the record has not already been used to resume a form (`consumed` is not `true`).
2. **Within the expiry window** - the record's `expireAt` is within the next N hours (configured by `expiryWindowInHours`, default 36).
3. **Not expiring too soon** - the record's `expireAt` is still at least M hours away (configured by `minimumHoursRemaining`, default 2). This avoids sending an email that arrives after the link has already expired, or with so little time remaining that the recipient is unable to do anything about it.
4. **Not already emailed** - `notify.expireEmailSentTimestamp` is `null`.
5. **Not currently locked by another instance** - the record either has no lock, or the lock is stale (older than 1 hour).

These criteria work together to create a time window. With the defaults, a record becomes eligible for a reminder email when it has between 2 and 36 hours remaining before expiry.

### Locking mechanism

Because multiple instances of the service may be running simultaneously (e.g. in production), a locking mechanism prevents the same email from being sent more than once.

Each service instance generates a unique `runtimeId` (a UUID) on startup. The processing flow for each eligible record is:

1. **Acquire lock** - An atomic `findOneAndUpdate` operation attempts to set `notify.expireLockId` to the instance's `runtimeId` and `notify.expireLockTimestamp` to the current time. This only succeeds if the record's `version` matches the expected value (optimistic concurrency) and the email hasn't already been sent. The `version` field is incremented atomically as part of this operation.
2. **Verify lock** - After the update, the returned document is checked to confirm that `notify.expireLockId` matches the current instance's `runtimeId`. If it doesn't match, the record is skipped.
3. **Send email** - The reminder email is sent via GOV.UK Notify.
4. **Mark as sent** - Another atomic update sets `notify.expireEmailSentTimestamp`, but only if `notify.expireLockId` still matches the current instance's `runtimeId`.

If a service instance crashes after acquiring the lock but before sending the email, the lock becomes stale after 1 hour. The record will then be picked up by the next scheduled run (on any instance) because the query treats locks older than 1 hour as expired.

### Email content

The reminder email includes:

- The name of the form (retrieved from the document's `form.title`, or fetched from the forms service if not present, with a fallback of "your form").
- The number of hours remaining before expiry (rounded down).
- A direct link to resume the form.
- A note that the link is single-use.

Form titles are cached in memory for the duration of each processing run to avoid repeated calls to the forms service for the same form.

## Configuration

### Settings specific to this feature

These environment variables control the expiry reminder email behaviour.

| Environment Variable                                                     | Config Key                                                      | Type    | Default        | Description                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_ENABLED`                 | `emailUsersExpiringSoonSavedForLaterLink.enabled`               | Boolean | `true`         | Enables or disables the expiry reminder email cron job entirely.                                                                                                                                      |
| `EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_CRON`                    | `emailUsersExpiringSoonSavedForLaterLink.cronSchedule`          | String  | `0 9-20 * * *` | Cron expression defining when the job runs (in UTC).                                                                                                                                                  |
| `EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_EXPIRY_WINDOW_HOURS`     | `emailUsersExpiringSoonSavedForLaterLink.expiryWindowInHours`   | Number  | `36`           | How many hours before expiry a record becomes eligible for a reminder email. Must be greater than `minimumHoursRemaining`.                                                                            |
| `EMAIL_USERS_EXPIRING_SOON_SAVED_FOR_LATER_LINK_MINIMUM_HOURS_REMAINING` | `emailUsersExpiringSoonSavedForLaterLink.minimumHoursRemaining` | Number  | `2`            | The minimum number of hours that must remain before expiry for a reminder to be sent. Prevents sending emails for links that are about to expire imminently. Must be less than `expiryWindowInHours`. |

A startup validation check ensures that `expiryWindowInHours` is strictly greater than `minimumHoursRemaining`. If this condition is not met, the service will fail to start.

### Pre-existing settings used by this feature

These settings are shared with other features (e.g. form submission confirmation emails). Changes to them will affect those other features too.

| Environment Variable           | Config Key                | Default | Description                                                                                                                                            |
| ------------------------------ | ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NOTIFY_TEMPLATE_ID`           | `notifyTemplateId`        | `null`  | The GOV.UK Notify template ID used for sending emails.                                                                                                 |
| `NOTIFY_REPLY_TO_ID`           | `notifyReplyToId`         | `null`  | The GOV.UK Notify reply-to email address ID.                                                                                                           |
| `NOTIFY_API_KEY`               | `notifyAPIKey`            | `null`  | The GOV.UK Notify API key.                                                                                                                             |
| `SAVE_AND_EXIT_EXPIRY_IN_DAYS` | `saveAndExitExpiryInDays` | `28`    | The number of days before a save-and-exit record expires. This determines the TTL on the MongoDB document and therefore when the expiry window begins. |

## Cron schedule

The cron expression controls when the job runs. The format uses five fields:

```
 ┌─────────── minute (0-59)
 │ ┌───────── hour (0-23)
 │ │ ┌─────── day of month (1-31)
 │ │ │ ┌───── month (1-12)
 │ │ │ │ ┌─── day of week (0-7, where 0 and 7 are Sunday)
 │ │ │ │ │
 * * * * *
```

All times are in UTC.

### Examples

| Expression         | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| `0 9-20 * * *`     | Every hour on the hour, from 9am to 8pm UTC (the default). |
| `*/30 8-21 * * *`  | Every 30 minutes, from 8am to 9pm UTC.                     |
| `0 * * * *`        | Every hour, 24 hours a day.                                |
| `0 9-17 * * 1-5`   | Every hour from 9am to 5pm UTC, weekdays only.             |
| `0 10,14,18 * * *` | Three times a day: at 10am, 2pm, and 6pm UTC.              |
| `15 9 * * *`       | Once a day at 9:15am UTC.                                  |

The default schedule (`0 9-20 * * *`) is designed to only send emails during daytime hours in the UK, avoiding waking someone up with a notification in the middle of the night.

## Logging

All log messages related to the save and exit expiry reminder feature are prefixed with `[SAER]` (Save And Exit Reminder). This makes it straightforward to filter logs for this feature in log aggregation tools. For example, to find all expiry reminder activity, search for `[SAER]`.

## MongoDB document properties

The following properties on the save-and-exit document are used by this feature. They sit alongside the existing fields (`magicLinkId`, `form`, `email`, `security`, `state`, `invalidPasswordAttempts`, `createdAt`, `expireAt`, `consumed`).

### `version`

| Type     | Default |
| -------- | ------- |
| `number` | `1`     |

An optimistic concurrency version counter. Incremented each time the record is locked for expiry email processing. Used in the lock acquisition query to ensure that only one instance can successfully lock a record, even if multiple instances attempt to lock it simultaneously.

### `notify`

An object containing the state of expiry email notifications for this record.

#### `notify.expireLockId`

| Type             | Default |
| ---------------- | ------- |
| `string \| null` | `null`  |

The `runtimeId` of the service instance that currently holds the lock for sending the expiry email. Set atomically during the lock acquisition step. Used to verify ownership before sending the email and before marking it as sent. A value of `null` means the record is not locked.

#### `notify.expireLockTimestamp`

| Type             | Default |
| ---------------- | ------- |
| `string \| null` | `null`  |

The timestamp **when the lock was acquired** (not when it will expire) in UTC. Used to detect stale locks: if this value is more than 1 hour old, the lock is considered expired and the record becomes eligible for processing again. This handles the case where an instance crashes after acquiring the lock but before completing the email send.

#### `notify.expireEmailSentTimestamp`

| Type             | Default |
| ---------------- | ------- |
| `string \| null` | `null`  |

The timestamp when the expiry reminder email was successfully sent in UTC. Once this is set, the record is excluded from all future queries and will never be emailed again. This is the definitive marker that the notification has been completed.

### MongoDB index

A compound index exists on `{ 'notify.expireEmailSentTimestamp': 1, expireAt: 1, consumed: 1 }` to support efficient querying of records eligible for expiry reminders.
