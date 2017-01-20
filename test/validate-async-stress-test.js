var tap = require('tap')

var poolModule = require('..')

tap.test('validateAsync multiple calls', function (t) {
  var create_count = 0

  var pool = poolModule.Pool({
    name: 'test',
    create: function (callback) {
      setTimeout(function () {
        create_count += 1
        callback(null, { id: create_count })
      }, 50)
    },
    validateAsync: function (resource, callback) {
          // console.log( "setTimeout Validate object count:", resource.count )
      setTimeout(function () {
          // console.log( "Validating object count:", resource.count )
        callback(true)
      }, 100)
    },
    destroy: function (client) {},
    max: 3,
    idleTimeoutMillis: 100,
    log: false
  })

  var borrowedObjects = []

  var acquire_release = function (num, in_use_count, available_count, release_timeout) {
    release_timeout = release_timeout || 100
    in_use_count = in_use_count === undefined ? 0 : in_use_count
    available_count = available_count === undefined ? 0 : available_count

      // console.log("Request " + num + " - available " + pool.availableObjectsCount())
    pool.acquire(function (err, obj) {
        // check we haven't already borrowed this before:
      t.equal(borrowedObjects.indexOf(obj), -1, 'acquire returned an object is currently acquired')
      borrowedObjects.push(obj)

        // console.log( "Acquire " + num + " - object id:", obj.id )
      t.error(err)
      t.ok(create_count <= 3)

      setTimeout(function () {
        var pos = borrowedObjects.indexOf(obj)
        borrowedObjects.splice(pos, 1)

          // console.log( "Release " + num + " - object id:", obj.id )
        pool.release(obj)
      }, release_timeout)
    })
  }

  acquire_release(1, 1)
  acquire_release(2, 2)
  acquire_release(3)
  acquire_release(4)

  setTimeout(function () {
    acquire_release(5)
    acquire_release(6)
    acquire_release(7)
    acquire_release(8, 3, 0, 50)
    acquire_release(9, 3, 0, 50)
    acquire_release(10, 3, 0, 50)
    acquire_release(11)
    acquire_release(12)

    pool.drain(function () {
      t.end()
    })
  }, 110)
})
