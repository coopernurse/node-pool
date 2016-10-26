'use strict'

const EvictionDefaults = require('./EvictionDefaults')

class EvictionOptions {
  /**
   * @param {Object} opt
   *   configuration for the pool
   * @param {Number} opts.runIntervalMillis
   *   How often to run eviction checks.  Default: 0 (does not run).
   * @param {Number} opts.numTestsPerRun
   *   Number of resources to check each run.  Default: 3.
   * @param {Number} opts.softIdleTimeoutMillis
   *   amount of time an object may sit idle in the pool before it is eligible
   *   for eviction by the idle object evictor (if any), with the extra condition
   *   that at least "min idle" object instances remain in the pool. Default -1 (nothing can get evicted)
   * @param {Number} opts.idleTimeoutMillis
   *   the minimum amount of time that an object may sit idle in the pool before it is eligible for eviction
   *   due to idle time. Supercedes "softIdleTimeoutMillis" Default: 30000
   */
  constructor (opts) {
    const evictionDefaults = new EvictionDefaults()

    opts = opts || {}

    this.runIntervalMillis = opts.runIntervalMillis || evictionDefaults.runIntervalMillis
    this.numTestsPerRun = opts.numTestsPerRun || evictionDefaults.numTestsPerRun
    this.softIdleTimeoutMillis = opts.softIdleTimeoutMillis || evictionDefaults.softIdleTimeoutMillis
    this.idleTimeoutMillis = opts.idleTimeoutMillis || evictionDefaults.idleTimeoutMillis
  }
}

module.exports = EvictionOptions
