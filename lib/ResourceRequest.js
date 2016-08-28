var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter

var nextLoop = require('./utils').nextLoop

/**
 * Wraps a users request for a resource
 * Basically a promise mashed in with a timeout
 * @private
 */
function ResourceRequest (requestCallback, ttl) {
  // requestCallback - callback registered by user that will either be be given an err
  // or instance of a requested resource
  // ttl - milliseconds till request times out (optional)
  if (typeof requestCallback !== 'function') {
    throw new Error('requestCallback is required and must be of type function')
  }

  EventEmitter.call(this)

  // TODO: expose via getter?
  this.state = ResourceRequest.PENDING
  this._requestCallback = requestCallback
  this._creationTimestamp = Date.now()
  this._timeout = null

  if (ttl !== undefined) {
    this.setTimeout(ttl)
  }
}

inherits(ResourceRequest, EventEmitter)

module.exports = ResourceRequest

// TODO: should these really live here? or be a seperate 'state' enum
ResourceRequest.PENDING = 'PENDING'
ResourceRequest.FULFILLED = 'FULFILLED'
ResourceRequest.REJECTED = 'REJECTED'

ResourceRequest.prototype.setTimeout = function (delay) {
  if (this.state !== ResourceRequest.PENDING) {
    throw new Error('ResourceRequest already resolved')
  }
  var ttl = parseInt(delay, 10)

  if (isNaN(ttl) || ttl <= 0) {
    throw new Error('delay must be a positive int')
  }

  var age = Date.now() - this._creationTimestamp
  var timeoutHandler = this._fireTimeout.bind(this)

  if (this._timeout) {
    this.removeTimeout()
  }

  if (age > ttl) {
    // FIXME: setImmediate is not available in less 0.12
    // backport this to the v2 branch
    nextLoop(timeoutHandler)
  } else {
    this._timeout = setTimeout(timeoutHandler, ttl - age)
  }
}

ResourceRequest.prototype.removeTimeout = function () {
  clearTimeout(this._timeout)
  this._timeout = null
}

ResourceRequest.prototype._fireTimeout = function () {
  // TODO: feels like hack, also what args shold we pass?
  this.emit('timeout')
  this.reject(new Error('ResourceRequest timed out'))
}

ResourceRequest.prototype.reject = function (err) {
  if (this.state !== ResourceRequest.PENDING) {
    throw new Error('ResourceRequest already fulfilled')
  }
  this.state = ResourceRequest.REJECTED
  this._fulfill(err)
}

ResourceRequest.prototype.resolve = function (resource) {
  if (this.state !== ResourceRequest.PENDING) {
    throw new Error('ResourceRequest already fulfilled')
  }
  this.state = ResourceRequest.FULFILLED
  this._fulfill(null, resource)
}

// TODO: rename this method...
ResourceRequest.prototype._fulfill = function (err, resource) {
  this.removeTimeout()
  // TODO: we explicitly null here for API/test compatibility... ditch in next major version bump
  if (err) {
    resource = null
  }

  // Notify watchers
  // FIXME: not sure this name is semantically wonderful?
  this.emit('fulfilled', err, resource)

  // TODO: document need to 'bind' if context is used by user code
  // TODO: check if we can apply(null...) here to remove our own context
  // without trashing bind
  this._requestCallback(err, resource)
}
