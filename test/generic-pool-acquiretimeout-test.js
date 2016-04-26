var tap = require('tap')
var Pool = require('../lib/generic-pool').Pool

tap.test('acquireTimeout handles timed out acquire calls', function (t) {
  var pool = new Pool({
    create: function (callback) {
      setTimeout(function () {
        callback(null, {})
      }, 100)
    },
    destroy: function () {},
    acquireTimeout: 20,
    idleTimeoutMillis: 150
  })

  pool.acquire(function (err, resource) {
    t.match(err, /ResourceRequest timed out/)
    t.end()
  })
})

tap.test('acquireTimeout handles non timed out acquire calls', function (t) {
  var myResource = {}
  var pool = new Pool({
    create: function (callback) {
      setTimeout(function () {
        callback(null, myResource)
      }, 10)
    },
    destroy: function () {},
    acquireTimeout: 20,
    idleTimeoutMillis: 150
  })

  pool.acquire(function (err, resource) {
    t.error(err)
    t.equal(resource, myResource)
    t.end()
  })
})
