'use strict'
/**
 * Create the default settings used by the pool
 *
 * @class
 */
class PoolDefaults {
  constructor () {
    this.idleTimeoutMillis = 30000
    this.lifo = true
    this.refreshIdle = true
    this.reapIntervalMillis = 1000
    this.priorityRange = 1

    this.testOnBorrow = false
    this.testOnReturn = false

    this.autostart = true

    // FIXME: no defaults!
    this.acquireTimeoutMillis = null
    this.maxWaitingClients = null

    this.min = null
    this.max = null
    // FIXME: this seems odd?
    this.Promise = Promise
  }
}

module.exports = PoolDefaults
