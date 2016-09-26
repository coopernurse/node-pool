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
   * @param {Number} config.idleTimeoutMillis
   *   Delay in milliseconds after the idle items in the pool will be destroyed.
   *   And idle item is that is not acquired yet. Waiting items doesn't count here.
   * @param {Number} config.reapIntervalMillis
   *   Cleanup is scheduled in every `config.reapIntervalMillis` milliseconds.
   * @param {Number} config.acquireTimeoutMillis
   *   Delay in milliseconds after which the an `acquire` call will fail. optional.
   *   Default: undefined. Should be positive and non-zero
   * @param {Number} config.priorityRange
   *   The range from 1 to be treated as a valid priority
   * @param {RefreshIdle} config.refreshIdle
   *   Should idle resources be destroyed and recreated every idleTimeoutMillis? Default: true.
   * @param {Bool} [config.fifo=true]
   *   Sets whether the pool has LIFO (last in, first out) behaviour with respect to idle objects.
   *   if false then pool has FIFO behaviour
   * @param {Bool} [config.autostart=true]
   *   Should the pool start creating resources etc once the constructor is called
   * @param {Promise} [config.Promise=Promise]
   *   What promise implementation should the pool use, defaults to native promises.
   */
  constructor (opts) {
    const poolDefaults = new PoolDefaults()

    opts = opts || {}

    this.idleTimeoutMillis = opts.idleTimeoutMillis || poolDefaults.idleTimeoutMillis
    this.fifo = (typeof opts.fifo === 'boolean') ? opts.fifo : poolDefaults.fifo
    this.refreshIdle = ('refreshIdle' in opts) ? opts.refreshIdle : poolDefaults.refreshIdle
    this.reapInterval = opts.reapIntervalMillis || poolDefaults.reapIntervalMillis
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

    this.Promise = (typeof opts.Promise === 'object') ? opts.Promise : poolDefaults.Promise
  }
}

module.exports = PoolOptions
