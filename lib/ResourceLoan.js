'use strict'

const Deferred = require('./Deferred')

/**
 * Plan is to maybe add tracking via Error objects
 * and other fun stuff!
 */

class ResourceLoan extends Deferred {
  /**
   *
   * @param  {PooledResource} pooledResource the PooledResource this loan belongs to
   * @return {[type]}                [description]
   */
  constructor (pooledResource, Promise) {
    super(Promise)
    this._creationTimestamp = Date.now()
    this.pooledResource = pooledResource
  }

  reject () {
    /**
     * Loans can only be resolved at the moment
     */
  }
}

module.exports = ResourceLoan
