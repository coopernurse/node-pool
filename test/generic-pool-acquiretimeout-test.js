var tap = require('tap')
var Pool = require('../lib/Pool')

// tap.test('acquireTimeout handles timed out acquire calls', function (t) {
//   var factory = {
//     create: function (callback) {
//       setTimeout(function () {
//         callback(null, {})
//       }, 100)
//     },
//     destroy: function () {}
//   }
//   var config = {
//     acquireTimeoutMillis: 20,
//     idleTimeoutMillis: 150,
//     log: true
//   }

//   var pool = new Pool(factory, config)

//   pool.acquire(function (err, resource) {
//     t.match(err, /ResourceRequest timed out/)
//     pool.drain(function () {
//       pool.destroyAllNow()
//       t.end()
//     })
//   })
// })

tap.test('acquireTimeout handles non timed out acquire calls', function (t) {
  var myResource = {}
  var factory = {
    create: function (callback) {
      setTimeout(function () {
        callback(null, myResource)
      }, 10)
    },
    destroy: function () {}
  }

  var config = {
    acquireTimeoutMillis: 400
  }

  var pool = new Pool(factory, config)

  pool.acquire(function (err, resource) {
    t.error(err)
    t.equal(resource, myResource)
    pool.release(resource)
    pool.drain(function () {
      pool.destroyAllNow()
      t.end()
    })
  })
})
