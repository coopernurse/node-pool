'use strict'

const errors = require('./errors')

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
class ResourceRequest {

  /**
   * [constructor description]
   * @param  {Number} ttl     timeout
   */
  constructor (ttl) {
    this._state = ResourceRequest.PENDING
    this.__resolve = undefined
    this.__reject = undefined
    this._creationTimestamp = Date.now()
    this._timeout = null

    if (ttl !== undefined) {
      this.setTimeout(ttl)
    }

    this._promise = new Promise((resolve, reject) => {
      this.__resolve = resolve
      this.__reject = reject
    })
  }

  get state () {
    return this._state
  }

  get promise () {
    return this._promise
  }

  setTimeout (delay) {
    if (this._state !== ResourceRequest.PENDING) {
      return
    }
    const ttl = parseInt(delay, 10)

    if (isNaN(ttl) || ttl <= 0) {
      throw new Error('delay must be a positive int')
    }

    const age = Date.now() - this._creationTimestamp

    if (this._timeout) {
      this.removeTimeout()
    }

    this._timeout = setTimeout(fbind(this._fireTimeout, this), Math.max(ttl - age, 0))
  }

  removeTimeout () {
    clearTimeout(this._timeout)
    this._timeout = null
  }

  _fireTimeout () {
    this.reject(new errors.TimeoutError('ResourceRequest timed out'))
  }

  reject (err) {
    if (this._state !== ResourceRequest.PENDING) {
      return
    }
    this.removeTimeout()
    this._state = ResourceRequest.REJECTED
    this.__reject(err)
  }

  resolve (resource) {
    if (this._state !== ResourceRequest.PENDING) {
      return
    }
    this.removeTimeout()
    this._state = ResourceRequest.FULFILLED
    this.__resolve(resource)
  }
}

// TODO: should these really live here? or be a seperate 'state' enum
ResourceRequest.PENDING = 'PENDING'
ResourceRequest.FULFILLED = 'FULFILLED'
ResourceRequest.REJECTED = 'REJECTED'

module.exports = ResourceRequest
