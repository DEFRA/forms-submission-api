/**
 * Creates a one-shot timer that records elapsed time in milliseconds.
 *
 * Call {@link stop} to freeze the elapsed time. Once stopped, the timer
 * cannot be restarted and {@link elapsed} will always return the same value.
 *
 * If {@link elapsed} is accessed before {@link stop} has been called, the
 * timer is stopped automatically so that repeated reads return a consistent
 * value.
 * @returns {{ stop: () => void, elapsed: number }}
 */
export function createTimer() {
  const startTime = performance.now()
  /** @type {number | undefined} */
  let duration

  return {
    /**
     * Stops the timer, freezing the elapsed time. Subsequent calls are
     * ignored — the timer cannot be restarted.
     */
    stop() {
      duration ??= Math.round(performance.now() - startTime)
    },

    /**
     * Returns the elapsed time in whole milliseconds. If {@link stop} has
     * not yet been called, it is called automatically so that repeated
     * reads always return the same value.
     */
    get elapsed() {
      this.stop()
      return /** @type {number} */ (duration)
    }
  }
}
