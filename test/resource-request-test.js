var tap = require('tap')
var ResourceRequest = require('../lib/ResourceRequest')

var noop = function () {}

tap.test('can be created', function (t) {
  var create = function () {
    var request = new ResourceRequest(noop, noop) // eslint-disable-line no-unused-vars
  }
  t.doesNotThrow(create)
  t.end()
})

tap.test('throws with no resolve', function (t) {
  var create = function () {
    var request = new ResourceRequest(undefined, noop) // eslint-disable-line no-unused-vars
  }
  t.throws(create, /resolve is required and must be of type function/)
  t.end()
})

tap.test('throws with no reject', function (t) {
  var create = function () {
    var request = new ResourceRequest(noop) // eslint-disable-line no-unused-vars
  }
  t.throws(create, /reject is required and must be of type function/)
  t.end()
})

tap.test('times out when created with a ttl', function (t) {
  var reject = function (err) {
    t.match(err, /ResourceRequest timed out/)
    t.end()
  }
  var resolve = function (r) {
    t.fail('should not resolve')
  }
  var request = new ResourceRequest(resolve, reject, 10) // eslint-disable-line no-unused-vars
})

tap.test('calls resolve when resolved', function (t) {
  var resource = {}
  var resolve = function (r) {
    t.equal(r, resource)
    t.end()
  }
  var reject = function (err) {
    t.error(err)
  }
  var request = new ResourceRequest(resolve, reject)
  request.resolve(resource)
})

tap.test('removeTimeout removes the timeout', function (t) {
  var reject = function (err) {
    t.error(err)
  }
  var request = new ResourceRequest(noop, reject, 10)
  request.removeTimeout()
  setTimeout(function () {
    t.end()
  }, 20)
})

tap.test('does nothing if resolved more than once', function (t) {
  var request = new ResourceRequest(noop, noop)
  t.doesNotThrow(function () {
    request.resolve({})
  })
  t.doesNotThrow(function () {
    request.resolve({})
  })
  t.end()
})
