var tap = require('tap')
var Pool = require('../lib/Pool')
var utils = require('./utils')
var ResourceFactory = utils.ResourceFactory

// tap.test('Pool expands only to max limit', function (t) {
//   var resourceFactory = new ResourceFactory()

//   var config = {
//     max: 1,
//     refreshIdle: false,
//     name: 'test1'
//   }

//   var pool = new Pool(resourceFactory, config)

//     // NOTES:
//     // - request a resource
//     // - once we have it, request another and check the pool is fool
//   pool.acquire(function (err, obj) {
//     t.error(err)
//     var poolIsFull = !pool.acquire(function (err, obj) {
//       t.error(err)
//       t.equal(1, resourceFactory.created)
//       pool.release(obj)
//       utils.stopPool(pool)
//       t.end()
//     })
//     t.ok(poolIsFull)
//     t.equal(1, resourceFactory.created)
//     pool.release(obj)
//   })
// })

// tap.test('Pool respects min limit', function (t) {
//   var resourceFactory = new ResourceFactory()

//   var config = {
//     name: 'test-min',
//     min: 1,
//     max: 2,
//     refreshIdle: false
//   }

//   var pool = new Pool(resourceFactory, config)

//     // FIXME: this logic only works because we know it takes ~1ms to create a resource
//     // we need better hooks into the pool probably to observe this...
//   setTimeout(function () {
//     t.equal(resourceFactory.created, 1)
//     utils.stopPool(pool)
//     t.end()
//   }, 10)
// })

// tap.test('min and max limit defaults', function (t) {
//   var resourceFactory = new ResourceFactory()

//   var config = {
//     name: 'test-limit-defaults',
//     refreshIdle: false
//   }

//   var pool = new Pool(resourceFactory, config)

//   t.equal(1, pool.getMaxPoolSize())
//   t.equal(0, pool.getMinPoolSize())
//   utils.stopPool(pool)
//   t.end()
// })

// tap.test('malformed min and max limits are ignored', function (t) {
//   var resourceFactory = new ResourceFactory()

//   var config = {
//     name: 'test-limit-defaults2',
//     refreshIdle: false,
//     min: 'asf',
//     max: []
//   }
//   var pool = new Pool(resourceFactory, config)

//   t.equal(1, pool.getMaxPoolSize())
//   t.equal(0, pool.getMinPoolSize())
//   utils.stopPool(pool)
//   t.end()
// })

// tap.test('min greater than max sets to max', function (t) {
//   var resourceFactory = new ResourceFactory()

//   var config = {
//     name: 'test-limit-defaults3',
//     refreshIdle: false,
//     min: 5,
//     max: 3
//   }
//   var pool = new Pool(resourceFactory, config)

//   t.equal(3, pool.getMaxPoolSize())
//   t.equal(3, pool.getMinPoolSize())
//   utils.stopPool(pool)
//   t.end()
// })

tap.test('supports priority on borrow', function (t) {
  // NOTE: this test is pretty opaque about what it's really testing/expecting...
  var borrowTimeLow = 0
  var borrowTimeHigh = 0
  var borrowCount = 0
  var i

  var resourceFactory = new ResourceFactory()

  var config = {
    name: 'test2',
    max: 1,
    refreshIdle: false,
    priorityRange: 2
  }

  var pool = new Pool(resourceFactory, config)

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

  var config = {
    name: 'test3',
    max: 2,
    refreshIdle: false
  }

  var pool = new Pool(resourceFactory, config)

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
    utils.stopPool(pool)
    t.end()
  }, 100)
})

tap.test('tests drain', function (t) {
  var count = 5
  var acquired = 0

  var resourceFactory = new ResourceFactory()
  var config = {
    name: 'test4',
    max: 2,
    idletimeoutMillis: 300000
  }
  var pool = new Pool(resourceFactory, config)

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
  var resourceFactory = {
    create: function (callback) {
      created++
      if (created < 5) {
        callback(new Error('Error occurred.'))
      } else {
        callback(null, { id: created })
      }
    },
    destroy: function (client) {}
  }
  var config = {
    name: 'test6',
    max: 1
  }

  var pool = new Pool(resourceFactory, config)

    // FIXME: this section no longer proves anything as factory
    // errors no longer bubble up through the acquire call
    // we need to make the Pool an Emitter

    // ensure that creation errors do not populate the pool.
  // for (var i = 0; i < 5; i++) {
  //   pool.acquire(function (err, client) {
  //     t.ok(err instanceof Error)
  //     t.ok(client === null)
  //   })
  // }

  var called = false
  pool.acquire(function (err, client) {
    t.ok(err === null)
    t.equal(typeof client.id, 'number')
    called = true
    pool.release(client)
  })

    // FIXME: arbitary timeout
  setTimeout(function () {
    t.ok(called)
    t.equal(pool.waitingClientsCount(), 0)
    utils.stopPool(pool)
    t.end()
  }, 50)
})

tap.test('handle creation errors for delayed creates', function (t) {
  var created = 0

  var resourceFactory = {
    create: function (callback) {
      created++
      if (created < 5) {
        setTimeout(function () {
          callback(new Error('Error occurred.'))
        }, 0)
      } else {
        setTimeout(function () {
          callback(null, { id: created })
        }, 0)
      }
    },
    destroy: function (client) {}
  }

  var config = {
    name: 'test6',
    max: 1
  }

  var pool = new Pool(resourceFactory, config)

    // FIXME: this section no longer proves anything as factory
    // errors no longer bubble up through the acquire call
    // we need to make the Pool an Emitter

    // ensure that creation errors do not populate the pool.
  // for (var i = 0; i < 5; i++) {
  //   pool.acquire(function (err, client) {
  //     t.ok(err instanceof Error)
  //     t.ok(client === null)
  //   })
  // }
  var called = false
  pool.acquire(function (err, client) {
    t.ok(err === null)
    t.equal(typeof client.id, 'number')
    called = true
    pool.release(client)
  })
  setTimeout(function () {
    t.ok(called)
    t.equal(pool.waitingClientsCount(), 0)
    utils.stopPool(pool)
    t.end()
  }, 50)
})

tap.test('pooled decorator should acquire and release', function (t) {
    // FIXME: assertion count should probably be replaced with t.plan?
  var assertionCount = 0
  var resourceFactory = new ResourceFactory()
  var config = {
    name: 'test1',
    max: 1,
    refreshIdle: false
  }
  var pool = new Pool(resourceFactory, config)

  var pooledFn = pool.pooled(function (client, cb) {
    t.equal(typeof client.id, 'number')
    t.equal(pool.getPoolSize(), 1)
    assertionCount += 2
    cb()
  })

  t.equal(pool.getPoolSize(), 0)
  assertionCount += 1

  pooledFn(function (err) {
      // FIXME: what is even happening in this block?
    if (err) { throw err }
    t.ok(true)
    assertionCount += 1
  })

  setTimeout(function () {
    t.equal(assertionCount, 4)
    t.equal(pool.availableObjectsCount(), 1)
    utils.stopPool(pool)
    t.end()
  }, 10)
})

tap.test('pooled decorator should pass arguments and return values', function (t) {
    // FIXME: assertion count should probably be replaced with t.plan?
  var assertionCount = 0
  var resourceFactory = new ResourceFactory()
  var config = {
    name: 'test1',
    max: 1
  }
  var pool = new Pool(resourceFactory, config)

  var pooledFn = pool.pooled(function (client, arg1, arg2, cb) {
    t.equal(arg1, 'First argument')
    t.equal(arg2, 'Second argument')
    assertionCount += 2
    cb(null, 'First return', 'Second return')
  })

  pooledFn('First argument', 'Second argument', function (err, retVal1, retVal2) {
    if (err) { throw err }
    t.equal(retVal1, 'First return')
    t.equal(retVal2, 'Second return')
    assertionCount += 2
  })

  setTimeout(function () {
    t.equal(assertionCount, 4)
    utils.stopPool(pool)
    t.end()
  }, 20)
})

// FIXME:  I'm not really sure what this testing...
tap.test('pooled decorator should allow undefined callback', function (t) {
  var assertionCount = 0
  var resourceFactory = new ResourceFactory()
  var config = {
    name: 'test1',
    max: 1,
    refreshIdle: false
  }

  var pool = new Pool(resourceFactory, config)

  var pooledFn = pool.pooled(function (client, arg, cb) {
    t.equal(arg, 'Arg!')
    assertionCount += 1
    cb()
  })

  pooledFn('Arg!')

  setTimeout(function () {
    t.equal(pool.getPoolSize(), 1)
    t.equal(assertionCount, 1)
    utils.stopPool(pool)
    t.end()
  }, 20)
})

// FIXME: this test needs fixing since we no longer bubble up factory errors
// only thing like resourceRequest timeouts etc
// tap.test('pooled decorator should forward pool errors', function (t) {
//   var assertionCount = 0
//   var pool = new Pool({
//     name: 'test1',
//     create: function (callback) { callback(new Error('Pool error')) },
//     destroy: function (client) {},
//     max: 1
//   })

//   var pooledFn = pool.pooled(function (cb) {
//     t.ok(false, "Pooled function shouldn't be called due to a pool error")
//   })

//   pooledFn(function (err, obj) {
//     t.equal(err.message, 'Pool error')
//     assertionCount += 1
//   })

//   setTimeout(function () {
//     t.equal(assertionCount, 1)
//     utils.stopPool(pool)
//     t.end()
//   }, 20)
// })

tap.test('getPoolSize', function (t) {
  var assertionCount = 0
  var resourceFactory = new ResourceFactory()
  var config = {
    name: 'test1',
    max: 2,
    refreshIdle: false
  }
  var pool = new Pool(resourceFactory, config)

  t.equal(pool.getPoolSize(), 0)
  assertionCount += 1
  pool.acquire(function (err, obj1) {
    if (err) { throw err }
    t.equal(pool.getPoolSize(), 1)
    assertionCount += 1
    pool.acquire(function (err, obj2) {
      if (err) { throw err }
      t.equal(pool.getPoolSize(), 2)
      assertionCount += 1

      pool.release(obj1)
      pool.release(obj2)

      pool.acquire(function (err, obj3) {
        if (err) { throw err }
          // should still be 2
        t.equal(pool.getPoolSize(), 2)
        assertionCount += 1
        pool.release(obj3)
      })
    })
  })

  setTimeout(function () {
    t.equal(assertionCount, 4)
    utils.stopPool(pool)
    t.end()
  }, 40)
})

tap.test('availableObjectsCount', function (t) {
  var assertionCount = 0
  var resourceFactory = new ResourceFactory()
  var config = {
    name: 'test1',
    max: 2,
    refreshIdle: false
  }
  var pool = new Pool(resourceFactory, config)

  t.equal(pool.availableObjectsCount(), 0)
  assertionCount += 1
  pool.acquire(function (err, obj1) {
    if (err) { throw err }
    t.equal(pool.availableObjectsCount(), 0)
    assertionCount += 1

    pool.acquire(function (err, obj2) {
      if (err) { throw err }
      t.equal(pool.availableObjectsCount(), 0)
      assertionCount += 1

      pool.release(obj1)
      t.equal(pool.availableObjectsCount(), 1)
      assertionCount += 1

      pool.release(obj2)
      t.equal(pool.availableObjectsCount(), 2)
      assertionCount += 1

      pool.acquire(function (err, obj3) {
        if (err) { throw err }
        t.equal(pool.availableObjectsCount(), 1)
        assertionCount += 1
        pool.release(obj3)

        t.equal(pool.availableObjectsCount(), 2)
        assertionCount += 1
      })
    })
  })

  setTimeout(function () {
    t.equal(assertionCount, 7)
    utils.stopPool(pool)
    t.end()
  }, 30)
})

// FIXME: remove completely when we scrap logging
// tap.test('logPassesLogLevel', function (t) {
//   var loglevels = {'verbose': 0, 'info': 1, 'warn': 2, 'error': 3}
//   var logmessages = {verbose: [], info: [], warn: [], error: []}
//   var factory = {
//     name: 'test1',
//     create: function (callback) { callback(null, {id: Math.floor(Math.random() * 1000)}) },
//     destroy: function (client) {},
//     max: 2,
//     log: function (msg, level) { testlog(msg, level) }
//   }
//   var testlog = function (msg, level) {
//     t.ok(level in loglevels)
//     logmessages[level].push(msg)
//   }
//   var pool = new Pool(factory)

//   pool.acquire(function (err, objA) {
//     t.error(err)
//     t.equal(logmessages.verbose[0], 'createResource() - creating obj - count=1 min=0 max=2')
//     t.equal(logmessages.info[0], 'dispense() clients=1 available=0')
//     logmessages.info = []
//     logmessages.verbose = []

//     pool.release(objA)
//     utils.stopPool(pool)
//     t.end()
//   })
// })

tap.test('removes from available objects on destroy', function (t) {
  var destroyCalled = false
  var factory = {
    create: function (callback) { callback(null, {}) },
    destroy: function (client) { destroyCalled = true }
  }

  var config = {
    name: 'test',
    max: 2
  }

  var pool = new Pool(factory, config)

  pool.acquire(function (err, obj) {
    t.error(err)
    pool.destroy(obj)
  })
  setTimeout(function () {
    t.equal(destroyCalled, true)
    t.equal(pool.availableObjectsCount(), 0)
    utils.stopPool(pool)
    t.end()
  }, 20)
})

tap.test('removes from available objects on validation failure', function (t) {
  var destroyCalled = false
  var validateCalled = false
  var count = 0
  var factory = {
    create: function (callback) { callback(null, {count: count++}) },
    destroy: function (client) { destroyCalled = client.count },
    validate: function (client) { validateCalled = true; return client.count > 0 }
  }
  var config = {
    name: 'test',
    max: 2,
    testOnBorrow: true
  }

  var pool = new Pool(factory, config)
  pool.acquire(function (err, obj) {
    t.error(err)
    pool.release(obj)
    t.equal(obj.count, 0)

    pool.acquire(function (err, obj2) {
      t.error(err)
      pool.release(obj2)
      t.equal(obj2.count, 1)
    })
  })
  setTimeout(function () {
    t.equal(validateCalled, true)
    t.equal(destroyCalled, 0)
    t.equal(pool.availableObjectsCount(), 1)
    utils.stopPool(pool)
    t.end()
  }, 20)
})

tap.test('removes from available objects on async validation failure', function (t) {
  var destroyCalled = false
  var validateCalled = false
  var count = 0
  var factory = {
    create: function (callback) { callback(null, {count: count++}) },
    destroy: function (client) { destroyCalled = client.count },
    validateAsync: function (client, callback) {
      validateCalled = true
      setTimeout(function () {
        callback(client.count > 0)
      })
    }
  }

  var config = {
    max: 1,
    name: 'async-failure-test',
    refreshIdle: false,
    testOnBorrow: true
  }

  var pool = new Pool(factory, config)
  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(obj.count, 0)
    pool.release(obj)

    pool.acquire(function (err, obj2) {
      t.error(err)
      t.equal(obj2.count, 1)
      pool.release(obj2)
    })
  })
  setTimeout(function () {
    t.equal(validateCalled, true)
    t.equal(destroyCalled, 0)
    t.equal(pool.availableObjectsCount(), 1)
    utils.stopPool(pool)
    t.end()
  }, 50)
})

tap.test('error on setting both validate functions', function (t) {
  var noop = function () {}
  var factory = {
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
    create: function (callback) {
      setTimeout(function () {
        resourceCreationAttempts++
        if (resourceCreationAttempts < 2) {
          return callback(new Error('Create Error'))
        }
        callback(null, {})
      }, 1)
    },
    destroy: function (client) {}
  }

  var config = {
    max: 1,
    refreshIdle: false,
    name: 'test'
  }

  var pool = new Pool(factory, config)
  // pool.acquire(function () {})
  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    pool.release(obj)
    utils.stopPool(pool)
    t.end()
  })
})

tap.test('returns only valid object to the pool', function (t) {
  var pool = new Pool({
    name: 'test',
    create: function (callback) {
      setTimeout(function () {
        callback(null, { id: 'validId' })
      }, 10)
    },
    destroy: function (client) {},
    max: 1
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
    utils.stopPool(pool)
    t.end()
  })
})

tap.test('validate acquires object from the pool', function (t) {
  var pool = new Pool({
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
    max: 1
  })

  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)
    pool.release(obj)
    utils.stopPool(pool)
    t.end()
  })
})

tap.test('validateAsync acquires object from the pool', function (t) {
  var pool = new Pool({
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
    max: 1
  })

  pool.acquire(function (err, obj) {
    t.error(err)
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)
    pool.release(obj)
    utils.stopPool(pool)
    t.end()
  })
})
