/**
 * Create the default settings used by the pool
 *
 * @class
 */
function PoolDefaults () {
  this.idleTimeoutMillis = 30000
  this.returnToHead = false
  this.refreshIdle = true
  this.reapIntervalMillis = 1000
  this.priorityRange = 1

  this.testOnBorrow = false
  this.testOnReturn = false

  // FIXME: no defaults!
  this.acquireTimeoutMillis = null
  this.maxWaitingClients = null

  this.min = null
  this.max = null

  this.name = 'anonymous'
}

module.exports = PoolDefaults
