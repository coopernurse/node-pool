'use strict'

const PoolDefaults = require('./PoolDefaults')

class PoolOptions {
  /**
   * @param {Object} config
   *   configuration for the pool
   * @param {Number} config.max
   *   Maximum number of items that can exist at the same time.  Default: 1.
   *   Any further acquire requests will be pushed to the waiting list.
   * @param {Number} config.min
   *   Minimum number of items in pool (including in-use). Default: 0.
   *   When the pool is created, or a resource destroyed, this minimum will
   *   be checked. If the pool resource count is below the minimum, a new
   *   resource will be created and added to the pool.
   * @param {Number} config.maxWaitingClients
   *   maximum number of queued requests allowed after which acquire calls will be rejected
   * @param {Number} config.acquireTimeoutMillis
   *   Delay in milliseconds after which the an `acquire` call will fail. optional.
   *   Default: undefined. Should be positive and non-zero
   * @param {Number} config.priorityRange
   *   The range from 1 to be treated as a valid priority
   * @param {Bool} [config.fifo=true]
   *   Sets whether the pool has LIFO (last in, first out) behaviour with respect to idle objects.
   *   if false then pool has FIFO behaviour
   * @param {Bool} [config.autostart=true]
   *   Should the pool start creating resources etc once the constructor is called
   * @param {Number} opts.evictionRunIntervalMillis
   *   How often to run eviction checks.  Default: 0 (does not run).
   * @param {Number} opts.numTestsPerEvictionRun
   *   Number of resources to check each eviction run.  Default: 3.
   * @param {Number} opts.softIdleTimeoutMillis
   *   amount of time an object may sit idle in the pool before it is eligible
   *   for eviction by the idle object evictor (if any), with the extra condition
   *   that at least "min idle" object instances remain in the pool. Default -1 (nothing can get evicted)
   * @param {Number} opts.idleTimeoutMillis
   *   the minimum amount of time that an object may sit idle in the pool before it is eligible for eviction
   *   due to idle time. Supercedes "softIdleTimeoutMillis" Default: 30000
   * @param {Promise} [config.Promise=Promise]
   *   What promise implementation should the pool use, defaults to native promises.
   */
  constructor (opts) {
    const poolDefaults = new PoolDefaults()

    opts = opts || {}

    this.fifo = (typeof opts.fifo === 'boolean') ? opts.fifo : poolDefaults.fifo
    this.priorityRange = opts.priorityRange || poolDefaults.priorityRange

    this.testOnBorrow = (typeof opts.testOnBorrow === 'boolean') ? opts.testOnBorrow : poolDefaults.testOnBorrow
    this.testOnReturn = (typeof opts.testOnReturn === 'boolean') ? opts.testOnReturn : poolDefaults.testOnReturn

    this.autostart = (typeof opts.autostart === 'boolean') ? opts.autostart : poolDefaults.autostart

    if (opts.acquireTimeoutMillis) {
      this.acquireTimeoutMillis = parseInt(opts.acquireTimeoutMillis, 10)
    }

    if (opts.maxWaitingClients) {
      this.maxWaitingClients = parseInt(opts.maxWaitingClients, 10)
    }

    this.max = parseInt(opts.max, 10)
    this.min = parseInt(opts.min, 10)

    this.max = Math.max(isNaN(this.max) ? 1 : this.max, 1)
    this.min = Math.min(isNaN(this.min) ? 0 : this.min, this.max)

    this.evictionRunIntervalMillis = opts.evictionRunIntervalMillis || poolDefaults.evictionRunIntervalMillis
    this.numTestsPerEvictionRun = opts.numTestsPerEvictionRun || poolDefaults.numTestsPerEvictionRun
    this.softIdleTimeoutMillis = opts.softIdleTimeoutMillis || poolDefaults.softIdleTimeoutMillis
    this.idleTimeoutMillis = opts.idleTimeoutMillis || poolDefaults.idleTimeoutMillis

    this.Promise = (opts.Promise != null) ? opts.Promise : poolDefaults.Promise
  }
}

module.exports = PoolOptions
