var tap = require('tap')
var Pool = require('../lib/generic-pool').Pool
var utils = require('./utils')
var ResourceFactory = utils.ResourceFactory

tap.test('Pool expands only to max limit', function (t) {
  var resourceFactory = new ResourceFactory()

  var factory = {
    name: 'test1',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    max: 1,
    refreshIdle: false
  }

  var pool = Pool(factory)

    // NOTES:
    // - request a resource
    // - once we have it, request another and check the pool is fool
  pool.acquire(function (err, obj) {
    t.error(err)
    var poolIsFull = !pool.acquire(function (err, obj) {
      t.error(err)
      t.equal(1, resourceFactory.created)
      pool.release(obj)
      utils.stopPool(pool)
      t.end()
    })
    t.ok(poolIsFull)
    t.equal(1, resourceFactory.created)
    pool.release(obj)
  })
})

tap.test('Pool respects min limit', function (t) {
  var resourceFactory = new ResourceFactory()

  var pool = Pool({
    name: 'test-min',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    min: 1,
    max: 2,
    refreshIdle: false
  })

    // FIXME: this logic only works because we know it takes ~1ms to create a resource
    // we need better hooks into the pool probably to observe this...
  setTimeout(function () {
    t.equal(resourceFactory.created, 1)
    utils.stopPool(pool)
    t.end()
  }, 10)
})

tap.test('min and max limit defaults', function (t) {
  var resourceFactory = new ResourceFactory()

  var factory = {
    name: 'test-limit-defaults',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    refreshIdle: false
  }
  var pool = Pool(factory)

  t.equal(1, pool.getMaxPoolSize())
  t.equal(0, pool.getMinPoolSize())
  t.end()
})

tap.test('malformed min and max limits are ignored', function (t) {
  var resourceFactory = new ResourceFactory()
  var factory = {
    name: 'test-limit-defaults2',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    refreshIdle: false,
    min: 'asf',
    max: []
  }
  var pool = Pool(factory)

  t.equal(1, pool.getMaxPoolSize())
  t.equal(0, pool.getMinPoolSize())
  t.end()
})

tap.test('min greater than max sets to max minus one', function (t) {
  var resourceFactory = new ResourceFactory()
  var factory = {
    name: 'test-limit-defaults3',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    refreshIdle: false,
    min: 5,
    max: 3
  }
  var pool = Pool(factory)

  t.equal(3, pool.getMaxPoolSize())
  t.equal(2, pool.getMinPoolSize())
  utils.stopPool(pool)
  t.end()
})

tap.test('supports priority on borrow', function (t) {
  // NOTE: this test is pretty opaque about what it's really testing/expecting...
  var borrowTimeLow = 0
  var borrowTimeHigh = 0
  var borrowCount = 0
  var i

  var resourceFactory = new ResourceFactory()

  var pool = Pool({
    name: 'test2',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    max: 1,
    refreshIdle: false,
    priorityRange: 2
  })

  for (i = 0; i < 10; i++) {
    pool.acquire(function (err, obj) {
      t.error(err)
      var time = Date.now()
      if (time > borrowTimeLow) { borrowTimeLow = time }
      borrowCount++
      pool.release(obj)
    }, 1)
  }

  for (i = 0; i < 10; i++) {
    pool.acquire(function (err, obj) {
      t.error(err)
      var time = Date.now()
      if (time > borrowTimeHigh) { borrowTimeHigh = time }
      borrowCount++
      pool.release(obj)
    }, 0)
  }

    // FIXME: another terrible set timeout hack to make the test pass
    // we should wait till all 20 resources are returned/destroyed
  setTimeout(function () {
    t.equal(20, borrowCount)
    t.equal(true, borrowTimeLow > borrowTimeHigh)
    utils.stopPool(pool)
    t.end()
  }, 200)
})

tap.test('removes correct object on reap', function (t) {
  var resourceFactory = new ResourceFactory()

  var pool = Pool({
    name: 'test3',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    max: 2,
    refreshIdle: false
  })

  pool.acquire(function (err, client) {
    t.error(err)
      // should be removed second
    setTimeout(function () { pool.destroy(client) }, 5)
  })
  pool.acquire(function (err, client) {
    t.error(err)
      // should be removed first
    pool.destroy(client)
  })

  setTimeout(function () {
    t.equal(1, resourceFactory.bin[0].id)
    t.equal(0, resourceFactory.bin[1].id)
    t.end()
  }, 100)
})

tap.test('tests drain', function (t) {
  var count = 5
  var acquired = 0

  var resourceFactory = new ResourceFactory()

  var pool = Pool({
    name: 'test4',
    create: resourceFactory.create.bind(resourceFactory),
    destroy: resourceFactory.destroy.bind(resourceFactory),
    max: 2,
    idletimeoutMillis: 300000
  })

    // request 5 resources that release after 250ms
  for (var i = 0; i < count; i++) {
    pool.acquire(function (err, client) {
      t.error(err)
      acquired += 1
      t.equal(typeof client.id, 'number')
      setTimeout(function () { pool.release(client) }, 250)
    })
  }
    // FIXME: what does this assertion prove?
  t.notEqual(count, acquired)
  pool.drain(function () {
    t.equal(count, acquired)
      // short circuit the absurdly long timeouts above.
    pool.destroyAllNow()
    t.end()
  })

    // subsequent calls to acquire should return an error.
  t.throws(function () {
    pool.acquire(function (client) {})
  }, Error)
})

tap.test('handle creation errors', function (t) {
  var created = 0
  var pool = Pool({
    name: 'test6',
    create: function (callback) {
      if (created < 5) {
        callback(new Error('Error occurred.'))
      } else {
        callback({ id: created })
      }
      created++
    },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 1000
  })

    // FIXME: this section no longer proves anything as factory
    // errors no longer bubble up through the acquire call
    // we need to make the Pool an Emitter

    // ensure that creation errors do not populate the pool.
  for (var i = 0; i < 5; i++) {
    pool.acquire(function (err, client) {
      t.ok(err instanceof Error)
      t.ok(client === null)
    })
  }

  var called = false
  pool.acquire(function (err, client) {
    t.ok(err === null)
    t.equal(typeof client.id, 'number')
    called = true
  })

    // FIXME: arbitary timeout
  setTimeout(function () {
    t.ok(called)
    t.equal(pool.waitingClientsCount(), 0)
    t.end()
  }, 50)
})

tap.test('handle creation errors for delayed creates', function (t) {
  var created = 0
  var pool = Pool({
    name: 'test6',
    create: function (callback) {
      if (created < 5) {
        setTimeout(function () {
          callback(new Error('Error occurred.'))
        }, 0)
      } else {
        setTimeout(function () {
          callback({ id: created })
        }, 0)
      }
      created++
    },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 1000
  })

    // FIXME: this section no longer proves anything as factory
    // errors no longer bubble up through the acquire call
    // we need to make the Pool an Emitter

    // ensure that creation errors do not populate the pool.
  for (var i = 0; i < 5; i++) {
    pool.acquire(function (err, client) {
      t.ok(err instanceof Error)
      t.ok(client === null)
    })
  }
  var called = false
  pool.acquire(function (err, client) {
    t.ok(err === null)
    t.equal(typeof client.id, 'number')
    called = true
  })
  setTimeout(function () {
    t.ok(called)
    t.equal(pool.waitingClientsCount(), 0)
    t.end()
  }, 50)
})

tap.test('pooled decorator should acquire and release', function (t) {
    // FIXME: assertion count should probably be replaced with t.plan?
  var assertion_count = 0
  var pool = Pool({
    name: 'test1',
    create: function (callback) { callback({id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 1,
    refreshIdle: false
  })

  var pooledFn = pool.pooled(function (client, cb) {
    t.equal(typeof client.id, 'number')
    t.equal(pool.getPoolSize(), 1)
    assertion_count += 2
    cb()
  })

  t.equal(pool.getPoolSize(), 0)
  assertion_count += 1

  pooledFn(function (err) {
      // FIXME: what is even happening in this block?
    if (err) { throw err }
    t.ok(true)
    assertion_count += 1
  })

  setTimeout(function () {
    t.equal(assertion_count, 4)
    t.equal(pool.availableObjectsCount(), 1)
    utils.stopPool(pool)
    t.end()
  }, 10)
})

tap.test('pooled decorator should pass arguments and return values', function (t) {
    // FIXME: assertion count should probably be replaced with t.plan?
  var assertion_count = 0
  var pool = Pool({
    name: 'test1',
    create: function (callback) { callback({id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 100
  })

  var pooledFn = pool.pooled(function (client, arg1, arg2, cb) {
    t.equal(arg1, 'First argument')
    t.equal(arg2, 'Second argument')
    assertion_count += 2
    cb(null, 'First return', 'Second return')
  })

  pooledFn('First argument', 'Second argument', function (err, retVal1, retVal2) {
    if (err) { throw err }
    t.equal(retVal1, 'First return')
    t.equal(retVal2, 'Second return')
    assertion_count += 2
  })

  setTimeout(function () {
    t.equal(assertion_count, 4)
    t.end()
  }, 20)
})

// FIXME:  I'm not really sure what this testing...
tap.test('pooled decorator should allow undefined callback', function (t) {
  var assertion_count = 0
  var pool = Pool({
    name: 'test1',
    create: function (callback) { callback({id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 100
  })

  var pooledFn = pool.pooled(function (client, arg, cb) {
    t.equal(arg, 'Arg!')
    assertion_count += 1
    cb()
  })

  pooledFn('Arg!')

  setTimeout(function () {
    t.equal(pool.getPoolSize(), 1)
    t.equal(assertion_count, 1)
    t.end()
  }, 20)
})

// FIXME: this test needs fixing since we no longer bubble up factory errors
// only thing like resourceRequest timeouts etc
tap.test('pooled decorator should forward pool errors', function (t) {
  var assertion_count = 0
  var pool = Pool({
    name: 'test1',
    create: function (callback) { callback(new Error('Pool error')) },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 100
  })

  var pooledFn = pool.pooled(function (cb) {
    t.ok(false, "Pooled function shouldn't be called due to a pool error")
  })

  pooledFn(function (err, obj) {
    t.equal(err.message, 'Pool error')
    assertion_count += 1
  })

  setTimeout(function () {
      // FIXME: re-enable this test when we fix it
      // t.equal(assertion_count, 1)
    t.end()
  }, 20)
})

tap.test('getPoolSize', function (t) {
  var assertion_count = 0
  var pool = Pool({
    name: 'test1',
    create: function (callback) { callback({id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 2,
    idleTimeoutMillis: 100
  })

  t.equal(pool.getPoolSize(), 0)
  assertion_count += 1
  pool.acquire(function (err, obj1) {
    if (err) { throw err }
    t.equal(pool.getPoolSize(), 1)
    assertion_count += 1
    pool.acquire(function (err, obj2) {
      if (err) { throw err }
      t.equal(pool.getPoolSize(), 2)
      assertion_count += 1

      pool.release(obj1)
      pool.release(obj2)

      pool.acquire(function (err, obj3) {
        if (err) { throw err }
          // should still be 2
        t.equal(pool.getPoolSize(), 2)
        assertion_count += 1
        pool.release(obj3)
      })
    })
  })

  setTimeout(function () {
    t.equal(assertion_count, 4)
    t.end()
  }, 40)
})

tap.test('availableObjectsCount', function (t) {
  var assertion_count = 0
  var pool = Pool({
    name: 'test1',
    create: function (callback) { callback({id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 2,
    idleTimeoutMillis: 100
  })

  t.equal(pool.availableObjectsCount(), 0)
  assertion_count += 1
  pool.acquire(function (err, obj1) {
    if (err) { throw err }
    t.equal(pool.availableObjectsCount(), 0)
    assertion_count += 1

    pool.acquire(function (err, obj2) {
      if (err) { throw err }
      t.equal(pool.availableObjectsCount(), 0)
      assertion_count += 1

      pool.release(obj1)
      t.equal(pool.availableObjectsCount(), 1)
      assertion_count += 1

      pool.release(obj2)
      t.equal(pool.availableObjectsCount(), 2)
      assertion_count += 1

      pool.acquire(function (err, obj3) {
        if (err) { throw err }
        t.equal(pool.availableObjectsCount(), 1)
        assertion_count += 1
        pool.release(obj3)

        t.equal(pool.availableObjectsCount(), 2)
        assertion_count += 1
      })
    })
  })

  setTimeout(function () {
    t.equal(assertion_count, 7)
    t.end()
  }, 30)
})

tap.test('logPassesLogLevel', function (t) {
  var loglevels = {'verbose': 0, 'info': 1, 'warn': 2, 'error': 3}
  var logmessages = {verbose: [], info: [], warn: [], error: []}
  var factory = {
    name: 'test1',
    create: function (callback) { callback(null, {id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 2,
    idleTimeoutMillis: 100,
    log: function (msg, level) { testlog(msg, level) }
  }
  var testlog = function (msg, level) {
    t.ok(level in loglevels)
    logmessages[level].push(msg)
  }
  var pool = Pool(factory)

  var pool2 = Pool({
    name: 'testNoLog',
    create: function (callback) { callback(null, {id: Math.floor(Math.random() * 1000)}) },
    destroy: function (client) {},
    max: 2,
    idleTimeoutMillis: 100
  })
  t.equal(pool2.getName(), 'testNoLog')

  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(logmessages.verbose[0], 'createResource() - creating obj - count=1 min=0 max=2')
    t.equal(logmessages.info[0], 'dispense() clients=1 available=0')
    logmessages.info = []
    logmessages.verbose = []
    pool2.borrow(function (err, obj) {
      t.error(err)
      t.equal(logmessages.info.length, 0)
      t.equal(logmessages.verbose.length, 0)
      t.equal(logmessages.warn.length, 0)
      t.end()
    })
  })
})

tap.test('removes from available objects on destroy', function (t) {
  var destroyCalled = false
  var factory = {
    name: 'test',
    create: function (callback) { callback(null, {}) },
    destroy: function (client) { destroyCalled = true },
    max: 2,
    idleTimeoutMillis: 100
  }

  var pool = Pool(factory)
  pool.acquire(function (err, obj) {
    t.error(err)
    pool.destroy(obj)
  })
  setTimeout(function () {
    t.equal(destroyCalled, true)
    t.equal(pool.availableObjectsCount(), 0)
    t.end()
  }, 10)
})

tap.test('removes from available objects on validation failure', function (t) {
  var destroyCalled = false
  var validateCalled = false
  var count = 0
  var factory = {
    name: 'test',
    create: function (callback) { callback(null, {count: count++}) },
    destroy: function (client) { destroyCalled = client.count },
    validate: function (client) { validateCalled = true; return client.count > 0 },
    max: 2,
    idleTimeoutMillis: 100
  }

  var pool = Pool(factory)
  pool.acquire(function (err, obj) {
    t.error(err)
    pool.release(obj)
    t.equal(obj.count, 0)

    pool.acquire(function (err, obj) {
      t.error(err)
      pool.release(obj)
      t.equal(obj.count, 1)
    })
  })
  setTimeout(function () {
    t.equal(validateCalled, true)
    t.equal(destroyCalled, 0)
    t.equal(pool.availableObjectsCount(), 1)
    t.end()
  }, 20)
})

tap.test('removes from available objects on async validation failure', function (t) {
  var destroyCalled = false
  var validateCalled = false
  var count = 0
  var factory = {
    name: 'test',
    create: function (callback) { callback(null, {count: count++}) },
    destroy: function (client) { destroyCalled = client.count },
    validateAsync: function (client, callback) { validateCalled = true; callback(client.count > 0) },
    max: 2,
    idleTimeoutMillis: 100
  }

  var pool = Pool(factory)
  pool.acquire(function (err, obj) {
    t.error(err)
    pool.release(obj)
    t.equal(obj.count, 0)

    pool.acquire(function (err, obj) {
      t.error(err)
      pool.release(obj)
      t.equal(obj.count, 1)
    })
  })
  setTimeout(function () {
    t.equal(validateCalled, true)
    t.equal(destroyCalled, 0)
    t.equal(pool.availableObjectsCount(), 1)
    t.end()
  }, 50)
})

tap.test('error on setting both validate functions', function (t) {
  var noop = function () {}
  var factory = {
    name: 'test',
    create: noop,
    destroy: noop,
    validate: noop,
    validateAsync: noop
  }

  t.throws(function () { Pool(factory) }, 'Only one of validate or validateAsync may be specified')
  t.end()
})

tap.test('do schedule again if error occured when creating new Objects async', function (t) {
  // NOTE: we're simulating the first few resource attempts failing
  var resourceCreationAttempts = 0

  var factory = {
    name: 'test',
    create: function (callback) {
      setTimeout(function () {
        resourceCreationAttempts++
        if (resourceCreationAttempts < 2) {
          return callback(new Error('Create Error'))
        }
        callback(null, {})
      }, 1)
    },
    destroy: function (client) {},
    max: 1,
    refreshIdle: false
  }

  var pool = Pool(factory)
  pool.acquire(function () {})
  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    t.end()
  })
})

tap.test('returns only valid object to the pool', function (t) {
  var pool = Pool({
    name: 'test',
    create: function (callback) {
      process.nextTick(function () {
        callback(null, { id: 'validId' })
      })
    },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 100
  })

  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)

      // Invalid release
    pool.release({})
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)

      // Valid release
    pool.release(obj)
    t.equal(pool.availableObjectsCount(), 1)
    t.equal(pool.inUseObjectsCount(), 0)
    t.end()
  })
})

tap.test('validate acquires object from the pool', function (t) {
  var pool = Pool({
    name: 'test',
    create: function (callback) {
      process.nextTick(function () {
        callback(null, { id: 'validId' })
      })
    },
    validate: function (resource) {
      return true
    },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 100
  })

  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)
    t.end()
  })
})

tap.test('validateAsync acquires object from the pool', function (t) {
  var pool = Pool({
    name: 'test',
    create: function (callback) {
      process.nextTick(function () {
        callback(null, { id: 'validId' })
      })
    },
    validateAsync: function (resource, callback) {
      callback(true)
    },
    destroy: function (client) {},
    max: 1,
    idleTimeoutMillis: 100
  })

  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)
    t.end()
  })
})

tap.test('domain context is preserved on acquire callback', function (t) {
  var assertion_count = 0
  var pool = Pool({
    name: 'test',
    create: function (cb) {
      cb(null, {})
    },
    destroy: function (client) {},
    max: 2,
    idleTimeoutMillis: 1000
  })

    // bail on old node versions because domains didn't exist until v0.8
  if (process.version < 'v0.8') {
    return t.end()
  }

  var domain = require('domain')

  function check (index, cb) {
    var wrapDomain = domain.create()
    wrapDomain.index = index

    wrapDomain.run(function () {
      pool.acquire(function (err, client) {
        t.error(err)
        t.equal(domain.active.index, index)
        assertion_count++
        setTimeout(function () {
          pool.release(client)
          setTimeout(cb, 1)
        }, 50)
      })
    })
  }

    // first two will work even without domain binding
  check(1, function () {
    check(2, function () {
      check(3, function () {
        t.end()
      })
    })
  })

    // third and on will fail without domain binding
})

tap.test('async destroy', function (t) {
  var created = 0
  var destroyed = 0
  var count = 5
  var acquired = 0

  var pool = Pool({
    name: 'test4',
    create: function (callback) { callback(null, {id: ++created}) },
    destroy: function (client, cb) {
      setTimeout(function () {
        destroyed += 1
        cb()
      }, 250)
    },
    max: 2,
    idletimeoutMillis: 300000
  })

  for (var i = 0; i < count; i++) {
    pool.acquire(function (err, client) {
      t.error(err)
      acquired += 1
      t.equal(typeof client.id, 'number')
      setTimeout(function () { pool.release(client) }, 250)
    })
  }
  t.notEqual(count, acquired)
  pool.drain(function () {
    var toDestroy = pool.availableObjectsCount()

    t.equal(count, acquired)
      // short circuit the absurdly long timeouts above.
    pool.destroyAllNow(function () {
      t.equal(toDestroy, destroyed)
      t.end()
    })
    t.equal(destroyed, 0)
  })
})

tap.test('async destroy - no breaking change', function (t) {
  var created = 0
  var destroyed = 0
  var max = 2
  var count = 5
  var acquired = 0

  var pool = Pool({
    name: 'test4',
    create: function (callback) { callback(null, {id: ++created}) },
    destroy: function (client) {
      destroyed += 1
    },
    max: max,
    idletimeoutMillis: 300000
  })

  for (var i = 0; i < count; i++) {
    pool.acquire(function (err, client) {
      t.error(err)
      acquired += 1
      t.equal(typeof client.id, 'number')
      setTimeout(function () { pool.release(client) }, 250)
    })
  }

  t.notEqual(count, acquired)

  pool.drain(function () {
    var toDestroy = pool.availableObjectsCount()
    t.equal(count, acquired)
      // short circuit the absurdly long timeouts above.
    pool.destroyAllNow(function () {
      t.equal(toDestroy, destroyed)
      t.end()
    })
    t.equal(toDestroy, destroyed)
  })
})
