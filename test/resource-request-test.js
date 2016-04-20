var tap = require('tap')
var ResourceRequest = require('../lib/generic-pool').ResourceRequest

var noop = function () {}

tap.test('can be created', function (t) {
  var create = function () {
    var request = new ResourceRequest(noop) // eslint-disable-line no-unused-vars
  }
  t.doesNotThrow(create)
  t.end()
})

tap.test('throws with no callback', function (t) {
  var create = function () {
    var request = new ResourceRequest() // eslint-disable-line no-unused-vars
  }
  t.throws(create, /requestCallback is required and must be of type function/)
  t.end()
})

tap.test('times out when created with a ttl', function (t) {
  var cb = function (err, r) {
    t.match(err, /ResourceRequest timed out/)
    t.end()
  }
  var request = new ResourceRequest(cb, 10) // eslint-disable-line no-unused-vars
})

tap.test('calls requestCallback when fulfilled', function (t) {
  var resource = {}
  var cb = function (err, r) {
    t.error(err)
    t.equal(r, resource)
    t.end()
  }
  var request = new ResourceRequest(cb)
  request.fulfill(null, resource)
})

tap.test('removeTimeout removes the timeout', function (t) {
  var cb = function (err, r) {
    t.error(err)
  }
  var request = new ResourceRequest(cb, 10)
  request.removeTimeout()
  setTimeout(function () {
    t.end()
  }, 20)
})

tap.test('throw if fulfilled more than once', function (t) {
  var request = new ResourceRequest(noop)
  t.doesNotThrow(function () {
    request.fulfill(null, {})
  })
  t.throws(function () {
    request.fulfill(null, {})
  }, /ResourceRequest already fulfilled/)
  t.end()
})
