'use strict'
/**
 * Create the default settings used by the pool
 *
 * @class
 */
class EvictionDefaults {
  constructor () {
    this.runIntervalMillis = 0
    this.numTestsPerRun = 3
    this.softIdleTimeoutMillis = -1
    this.idleTimeoutMillis = -1
  }
}

module.exports = EvictionDefaults
