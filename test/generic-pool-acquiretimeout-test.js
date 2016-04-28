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
    acquireTimeoutMillis: 20,
    idleTimeoutMillis: 150
  })

  pool.acquire(function (err, resource) {
    t.match(err, /ResourceRequest timed out/)
    t.end()
    pool.drain(function () {
      pool.destroyAllNow()
    })
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
    acquireTimeoutMillis: 20,
    idleTimeoutMillis: 150
  })

  pool.acquire(function (err, resource) {
    t.error(err)
    t.equal(resource, myResource)
    pool.release(resource)
    t.end()
    pool.drain(function () {
      pool.destroyAllNow()
    })
  })
})
