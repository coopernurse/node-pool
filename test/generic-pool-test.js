'use strict'

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
  let borrowTimeLow = 0
  let borrowTimeHigh = 0
  let borrowCount = 0

  const resourceFactory = new ResourceFactory()

  const config = {
    name: 'test2',
    max: 1,
    refreshIdle: false,
    priorityRange: 2
  }

  const pool = new Pool(resourceFactory, config)

  function lowPriorityOnFulfilled (obj) {
    const time = Date.now()
    if (time > borrowTimeLow) { borrowTimeLow = time }
    borrowCount++
    pool.release(obj)
  }

  function highPriorityOnFulfilled (obj) {
    const time = Date.now()
    if (time > borrowTimeHigh) { borrowTimeHigh = time }
    borrowCount++
    pool.release(obj)
  }

  const operations = []

  for (let i = 0; i < 10; i++) {
    const op = pool.acquire(1).then(lowPriorityOnFulfilled)
    operations.push(op)
  }

  for (let i = 0; i < 10; i++) {
    const op = pool.acquire(0).then(highPriorityOnFulfilled)
    operations.push(op)
  }

  Promise.all(operations).then(function () {
    t.equal(20, borrowCount)
    t.equal(true, borrowTimeLow >= borrowTimeHigh)
    utils.stopPool(pool)
    t.end()
  })
  .catch(t.threw)
})

// FIXME: bad test!
// pool.destroy makes no obligations to user about when it will destroy the resource
// we should test that "destroyed" objects are not acquired again instead
// tap.test('removes correct object on reap', function (t) {
//   const resourceFactory = new ResourceFactory()

//   const config = {
//     name: 'test3',
//     max: 2,
//     refreshIdle: false
//   }

//   const pool = new Pool(resourceFactory, config)

//   const op1 = pool.acquire()
//   .then(function (client) {
//     return new Promise(function (resolve, reject) {
//       // should be removed second
//       setTimeout(function () {
//         pool.destroy(client)
//         resolve()
//       }, 5)
//     })
//   })

//   const op2 = pool.acquire()
//   .then(function (client) {
//     pool.destroy(client)
//   })

//   Promise.all([op1, op2]).then(function () {
//     t.equal(1, resourceFactory.bin[0].id)
//     t.equal(0, resourceFactory.bin[1].id)
//     utils.stopPool(pool)
//     t.end()
//   })
//   .catch(t.threw)
// })

tap.test('tests drain', function (t) {
  const count = 5
  let acquired = 0

  const resourceFactory = new ResourceFactory()
  const config = {
    name: 'test4',
    max: 2,
    idletimeoutMillis: 300000
  }
  const pool = new Pool(resourceFactory, config)

  const operations = []

  function onAcquire (client) {
    acquired += 1
    t.equal(typeof client.id, 'number')
    setTimeout(function () {
      pool.release(client)
    }, 250)
  }

    // request 5 resources that release after 250ms
  for (let i = 0; i < count; i++) {
    const op = pool.acquire().then(onAcquire)
    operations.push(op)
  }
    // FIXME: what does this assertion prove?
  t.notEqual(count, acquired)

  Promise.all(operations)
  .then(function () {
    return pool.drain()
  })
  .then(function () {
    t.equal(count, acquired)
    // short circuit the absurdly long timeouts above.
    pool.clear()
  })
  .then(function () {
    // subsequent calls to acquire should resolve an error.
    return pool.acquire().then(t.fail,
      function (e) {
        t.type(e, Error)
      })
  })
  .then(function () {
    t.end()
  })
})

tap.test('handle creation errors', function (t) {
  let created = 0
  const resourceFactory = {
    create: function () {
      created++
      if (created < 5) {
        return Promise.reject(new Error('Error occurred.'))
      } else {
        return Promise.resolve({ id: created })
      }
    },
    destroy: function (client) {}
  }
  const config = {
    name: 'test6',
    max: 1
  }

  const pool = new Pool(resourceFactory, config)

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

  let called = false
  pool.acquire()
  .then(function (client) {
    t.equal(typeof client.id, 'number')
    called = true
    pool.release(client)
  })
  .then(function () {
    t.ok(called)
    t.equal(pool.waitingClientsCount(), 0)
    utils.stopPool(pool)
    t.end()
  })
  .catch(t.threw)
})

tap.test('handle creation errors for delayed creates', function (t) {
  let attempts = 0

  const resourceFactory = {
    create: function () {
      attempts++
      if (attempts <= 5) {
        return Promise.reject(new Error('Error occurred.'))
      } else {
        return Promise.resolve({ id: attempts })
      }
    },
    destroy: function (client) { return Promise.resolve() }
  }

  const config = {
    name: 'test6',
    max: 1
  }

  const pool = new Pool(resourceFactory, config)

  let errorCount = 0
  pool.on('factoryCreateError', function (err) {
    t.ok(err instanceof Error)
    errorCount++
  })

  let called = false
  pool.acquire()
  .then(function (client) {
    t.equal(typeof client.id, 'number')
    called = true
    pool.release(client)
  })
  .then(function () {
    t.ok(called)
    t.equal(errorCount, 5)
    t.equal(pool.waitingClientsCount(), 0)
    utils.stopPool(pool)
    t.end()
  })
  .catch(t.threw)
})

tap.test('pooled decorator should acquire and release', function (t) {
  // FIXME: assertion count should probably be replaced with t.plan?
  let assertionCount = 0
  const resourceFactory = new ResourceFactory()
  const config = {
    name: 'test1',
    max: 1,
    refreshIdle: false
  }
  const pool = new Pool(resourceFactory, config)

  const pooledFn = pool.pooled(function (client, cb) {
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

  utils.stopPool(pool)
  .then(function () {
    t.equal(assertionCount, 4)
    t.end()
  })
})

tap.test('pooled decorator should pass arguments and return values', function (t) {
    // FIXME: assertion count should probably be replaced with t.plan?
  let assertionCount = 0
  const resourceFactory = new ResourceFactory()
  const config = {
    name: 'test1',
    max: 1
  }
  const pool = new Pool(resourceFactory, config)

  const pooledFn = pool.pooled(function (client, arg1, arg2, cb) {
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

  utils.stopPool(pool)
  .then(function () {
    t.equal(assertionCount, 4)
    t.end()
  })
})

// FIXME:  I'm not really sure what this testing...
tap.test('pooled decorator should allow undefined callback', function (t) {
  let assertionCount = 0
  const resourceFactory = new ResourceFactory()
  const config = {
    name: 'test1',
    max: 1,
    refreshIdle: false
  }

  const pool = new Pool(resourceFactory, config)

  const pooledFn = pool.pooled(function (client, arg, cb) {
    t.equal(arg, 'Arg!')
    assertionCount += 1
    cb()
  })

  pooledFn('Arg!')

  t.equal(pool.getPoolSize(), 1)

  utils.stopPool(pool)
  .then(function () {
    t.equal(assertionCount, 1)
    t.end()
  })
})

tap.test('pooled decorator should not forward pool factory errors', function (t) {
  let assertionCount = 0

  let attempts = 0
  const resourceFactory = {
    create: function () {
      attempts++
      if (attempts <= 1) {
        return Promise.reject(new Error('Error occurred.'))
      } else {
        return Promise.resolve({ id: attempts })
      }
    },
    destroy: function (client) { return Promise.resolve() }
  }

  const pool = new Pool(resourceFactory,
    {
      max: 1,
      name: 'test1'
    })

  var pooledFn = pool.pooled(function (resource, cb) {
    cb()
  })

  pooledFn(function (err, obj) {
    t.error(err, 'Pool error was forwarded!')
    assertionCount++
  })

  utils.stopPool(pool)
  .then(function () {
    t.equal(assertionCount, 1)
    t.end()
  })
})

tap.test('pooled decorator should forward pool acquire timeout errors', function (t) {
  let assertionCount = 0

  let attempts = 0
  const resourceFactory = {
    create: function () {
      attempts++
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ id: attempts })
        }, 20)
      })
    },
    destroy: function (client) { return Promise.resolve() }
  }

  const pool = new Pool(resourceFactory,
    {
      acquireTimeoutMillis: 10,
      max: 1,
      name: 'test1'
    })

  var pooledFn = pool.pooled(function (resource, cb) {
    cb()
  })

  pooledFn(function (err, obj) {
    t.match(err, /ResourceRequest timed out/)
    assertionCount++
  })

  utils.stopPool(pool)
  .then(function () {
    t.equal(assertionCount, 1)
    t.end()
  })
})

tap.test('getPoolSize', function (t) {
  let assertionCount = 0
  const resourceFactory = new ResourceFactory()
  const config = {
    name: 'test1',
    max: 2,
    refreshIdle: false
  }

  const pool = new Pool(resourceFactory, config)

  const borrowedResources = []

  t.equal(pool.getPoolSize(), 0)
  assertionCount += 1

  pool.acquire()
  .then(function (obj) {
    borrowedResources.push(obj)
    t.equal(pool.getPoolSize(), 1)
    assertionCount += 1
  })
  .then(function () {
    return pool.acquire()
  })
  .then(function (obj) {
    borrowedResources.push(obj)
    t.equal(pool.getPoolSize(), 2)
    assertionCount += 1
  })
  .then(function () {
    pool.release(borrowedResources.shift())
    pool.release(borrowedResources.shift())
  })
  .then(function () {
    return pool.acquire()
  })
  .then(function (obj) {
    // should still be 2
    t.equal(pool.getPoolSize(), 2)
    assertionCount += 1
    pool.release(obj)
  })
  .then(function () {
    t.equal(assertionCount, 4)
    utils.stopPool(pool)
    t.end()
  })
  .catch(t.threw)
})

tap.test('availableObjectsCount', function (t) {
  let assertionCount = 0
  const resourceFactory = new ResourceFactory()
  const config = {
    name: 'test1',
    max: 2,
    refreshIdle: false
  }

  const pool = new Pool(resourceFactory, config)

  const borrowedResources = []

  t.equal(pool.availableObjectsCount(), 0)
  assertionCount += 1

  pool.acquire()
  .then(function (obj) {
    borrowedResources.push(obj)
    t.equal(pool.availableObjectsCount(), 0)
    assertionCount += 1
  }).then(function () {
    return pool.acquire()
  })
  .then(function (obj) {
    borrowedResources.push(obj)
    t.equal(pool.availableObjectsCount(), 0)
    assertionCount += 1
  })
  .then(function () {
    pool.release(borrowedResources.shift())
    t.equal(pool.availableObjectsCount(), 1)
    assertionCount += 1

    pool.release(borrowedResources.shift())
    t.equal(pool.availableObjectsCount(), 2)
    assertionCount += 1
  })
  .then(function () {
    return pool.acquire()
  })
  .then(function (obj) {
    t.equal(pool.availableObjectsCount(), 1)
    assertionCount += 1
    pool.release(obj)

    t.equal(pool.availableObjectsCount(), 2)
    assertionCount += 1
  })
  .then(function () {
    t.equal(assertionCount, 7)
    utils.stopPool(pool)
    t.end()
  })
  .catch(t.threw)
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

// FIXME: bad test!
// pool.destroy makes no obligations to user about when it will destroy the resource
// we should test that "destroyed" objects are not acquired again instead
// tap.test('removes from available objects on destroy', function (t) {
//   let destroyCalled = false
//   const factory = {
//     create: function () { return Promise.resolve({}) },
//     destroy: function (client) { destroyCalled = true; return Promise.resolve() }
//   }

//   const config = {
//     name: 'test',
//     max: 2
//   }

//   const pool = new Pool(factory, config)

//   pool.acquire().then(function (obj) {
//     pool.destroy(obj)
//   })
//   .then(function () {
//     t.equal(destroyCalled, true)
//     t.equal(pool.availableObjectsCount(), 0)
//     utils.stopPool(pool)
//     t.end()
//   })
//   .catch(t.threw)
// })

// FIXME: bad test!
// pool.destroy makes no obligations to user about when it will destroy the resource
// we should test that "destroyed" objects are not acquired again instead
// tap.test('removes from available objects on validation failure', function (t) {
//   var destroyCalled = false
//   var validateCalled = false
//   var count = 0
//   var factory = {
//     create: function () { return Promise.resolve({count: count++}) },
//     destroy: function (client) { destroyCalled = client.count },
//     validate: function (client) {
//       validateCalled = true
//       return Promise.resolve(client.count > 0)
//     }
//   }

//   var config = {
//     name: 'test',
//     max: 2,
//     testOnBorrow: true
//   }

//   var pool = new Pool(factory, config)

//   pool.acquire()
//   .then(function (obj) {
//     pool.release(obj)
//     t.equal(obj.count, 0)
//   })
//   .then(function () {
//     return pool.acquire()
//   })
//   .then(function (obj2) {
//     pool.release(obj2)
//     t.equal(obj2.count, 1)
//   })
//   .then(function () {
//     t.equal(validateCalled, true)
//     t.equal(destroyCalled, 0)
//     t.equal(pool.availableObjectsCount(), 1)
//     utils.stopPool(pool)
//     t.end()
//   })
//   .catch(t.threw)
// })

tap.test('do schedule again if error occured when creating new Objects async', function (t) {
  // NOTE: we're simulating the first few resource attempts failing
  var resourceCreationAttempts = 0

  var factory = {
    create: function () {
      resourceCreationAttempts++
      if (resourceCreationAttempts < 2) {
        return Promise.reject(new Error('Create Error'))
      }
      return Promise.resolve({})
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
  pool.acquire().then(function (obj) {
    t.equal(pool.availableObjectsCount(), 0)
    pool.release(obj)
    utils.stopPool(pool)
    t.end()
  }).catch(t.threw)
})

tap.test('returns only valid object to the pool', function (t) {
  var pool = new Pool({
    name: 'test',
    create: function () {
      return Promise.resolve({ id: 'validId' })
    },
    destroy: function (client) {},
    max: 1
  })

  pool.acquire().then(function (obj) {
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
  }).catch(t.threw)
})

tap.test('validate acquires object from the pool', function (t) {
  var pool = new Pool({
    name: 'test',
    create: function () {
      return Promise.resolve({ id: 'validId' })
    },
    validate: function (resource) {
      return Promise.resolve(true)
    },
    destroy: function (client) {},
    max: 1
  })

  pool.acquire()
  .then(function (obj) {
    t.equal(pool.availableObjectsCount(), 0)
    t.equal(pool.inUseObjectsCount(), 1)
    pool.release(obj)
    utils.stopPool(pool)
    t.end()
  })
  .catch(t.threw)
})
