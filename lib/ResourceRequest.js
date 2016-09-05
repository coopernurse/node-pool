'use strict'

const EventEmitter = require('events').EventEmitter

function fbind (fn, ctx) {
  return function bound () {
    return fn.apply(ctx, arguments)
  }
}

/**
 * Wraps a users request for a resource
 * Basically a promise mashed in with a timeout
 * @private
 */
class ResourceRequest extends EventEmitter {

  /**
   * [constructor description]
   * @param  {Function} resolve A Promise executor's fulfill function
   * @param  {Function} reject  A Promise executor's reject function
   * @param  {Number} ttl     timeout
   */
  constructor (resolve, reject, ttl) {
    super()

    if (typeof resolve !== 'function') {
      throw new Error('resolve is required and must be of type function')
    }

    if (typeof reject !== 'function') {
      throw new Error('reject is required and must be of type function')
    }

    this._state = ResourceRequest.PENDING
    this.__resolve = resolve
    this.__reject = reject
    this._creationTimestamp = Date.now()
    this._timeout = null

    if (ttl !== undefined) {
      this.setTimeout(ttl)
    }
  }

  get state () {
    return this._state
  }

  setTimeout (delay) {
    if (this._state !== ResourceRequest.PENDING) {
      throw new Error('ResourceRequest already resolved')
    }
    const ttl = parseInt(delay, 10)

    if (isNaN(ttl) || ttl <= 0) {
      throw new Error('delay must be a positive int')
    }

    const age = Date.now() - this._creationTimestamp
    const timeoutHandler = fbind(this._fireTimeout, this)

    if (this._timeout) {
      this.removeTimeout()
    }

    this._timeout = setTimeout(timeoutHandler, Math.max(ttl - age, 0))
  }

  removeTimeout () {
    clearTimeout(this._timeout)
    this._timeout = null
  }

  _fireTimeout () {
    // TODO: feels like hack, also what args shold we pass?
    this.emit('timeout')
    this.reject(new Error('ResourceRequest timed out'))
  }

  reject (err) {
    if (this._state !== ResourceRequest.PENDING) {
      throw new Error('ResourceRequest already fulfilled')
    }
    this.removeTimeout()
    this._state = ResourceRequest.REJECTED
    this.__reject(err)
    // Notify watchers
    // FIXME: not sure this name is semantically wonderful?
    // rename to settled?
    this.emit('fulfilled')
  }

  resolve (resource) {
    if (this._state !== ResourceRequest.PENDING) {
      throw new Error('ResourceRequest already fulfilled')
    }
    this.removeTimeout()
    this._state = ResourceRequest.FULFILLED
    this.__resolve(resource)
    // Notify watchers
    // FIXME: not sure this name is semantically wonderful?
    this.emit('fulfilled')
  }
}

// TODO: should these really live here? or be a seperate 'state' enum
ResourceRequest.PENDING = 'PENDING'
ResourceRequest.FULFILLED = 'FULFILLED'
ResourceRequest.REJECTED = 'REJECTED'

module.exports = ResourceRequest
