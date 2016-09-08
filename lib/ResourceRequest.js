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
   * @param  {Number} ttl     timeout
   */
  constructor (ttl) {
    super()

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
      return
    }
    this.removeTimeout()
    this._state = ResourceRequest.REJECTED
    this.__reject(err)
    // Notify watchers
    this.emit('settled', this._state)
  }

  resolve (resource) {
    if (this._state !== ResourceRequest.PENDING) {
      return
    }
    this.removeTimeout()
    this._state = ResourceRequest.FULFILLED
    this.__resolve(resource)
    // Notify watchers
    this.emit('settled', this._state)
  }
}

// TODO: should these really live here? or be a seperate 'state' enum
ResourceRequest.PENDING = 'PENDING'
ResourceRequest.FULFILLED = 'FULFILLED'
ResourceRequest.REJECTED = 'REJECTED'

module.exports = ResourceRequest
