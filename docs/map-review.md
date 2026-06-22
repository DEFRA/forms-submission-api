# Reviewing a map question

The output value from map questions (`type: GeospatialField`) is an array of [geojson](https://geojson.org/) [Feature`s](https://datatracker.ietf.org/doc/html/rfc7946#section-3.2), otherwise known as a `FeatureCollection`.

This format contains all the geographical information needed to understand the spatial information the user had submitted.
If you prefer a more visual representation of the data and would like to view the submitted geospatial information on an interactive map just as the user would have seen it, we provide a URL for you to do that.

The format of the path is `/submission/{referenceNumber}/map-review/{pageId}/{componentId}`. This is available through the `forms-designer` service which has the following domains on CDP:

```
Dev https://forms-designer.dev.cdp-int.defra.cloud
Test https://forms-designer.test.cdp-int.defra.cloud
Perf-test https://forms-designer.perf-test.cdp-int.defra.cloud
Prod https://forms.defra.gov.uk/
```

For example, a submission in `prod` may look like this: `https://forms.defra.gov.uk/submission/FZM-CFT-357/map-review/0b608f84-d2e2-4158-9737-37bd49305fd3/6b4c5b0d-7a49-459e-b9dc-db0b18cbeaa7`

Here the reference number is `FZM-CFT-357`, pageId is `0b608f84-d2e2-4158-9737-37bd49305fd3` and componentId `6b4c5b0d-7a49-459e-b9dc-db0b18cbeaa7`.

The machine readable output payload includes `referenceNumber` in `meta.referenceNumber`. Both `pageId` and `componentId` can be found in `meta.definition` giving everything needed to construct a URL to send users to review map submissions for each question.

Users will need to have login credentials to our `forms-designer` service. If you would like to start using Defra Forms Designer, <a href="mailto:defraforms@defra.gov.uk">contact the Defra Forms team</a>.
