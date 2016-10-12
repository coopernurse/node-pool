/**
 * @class
 * @private
 */
function PriorityQueue (size) {
  if (!(this instanceof PriorityQueue)) {
    return new PriorityQueue()
  }

  this._size = size
  this._slots = null
  this._total = null

  // initialize arrays to hold queue elements
  size = Math.max(+size | 0, 1)
  this._slots = []
  for (var i = 0; i < size; i += 1) {
    this._slots.push([])
  }
}

PriorityQueue.prototype.size = function size () {
  if (this._total === null) {
    this._total = 0
    for (var i = 0; i < this._size; i += 1) {
      this._total += this._slots[i].length
    }
  }
  return this._total
}

PriorityQueue.prototype.enqueue = function enqueue (obj, priority) {
  var priorityOrig

  // Convert to integer with a default value of 0.
  priority = priority && +priority | 0 || 0

  // Clear cache for total.
  this._total = null
  if (priority) {
    priorityOrig = priority
    if (priority < 0 || priority >= this._size) {
      priority = (this._size - 1)
      // put obj at the end of the line
      console.error('invalid priority: ' + priorityOrig + ' must be between 0 and ' + priority)
    }
  }

  this._slots[priority].push(obj)
}

PriorityQueue.prototype.dequeue = function dequeue (callback) {
  var obj = null
  // Clear cache for total.
  this._total = null
  for (var i = 0, sl = this._slots.length; i < sl; i += 1) {
    if (this._slots[i].length) {
      obj = this._slots[i].shift()
      break
    }
  }
  return obj
}

function doWhileAsync (conditionFn, iterateFn, callbackFn) {
  var next = function () {
    if (conditionFn()) {
      iterateFn(next)
    } else {
      callbackFn()
    }
  }
  next()
}

/**
 * Generate an Object pool with a specified `factory`.
 *
 * @class
 * @param {Object} factory
 *   Factory to be used for generating and destorying the items.
 * @param {String} factory.name
 *   Name of the factory. Serves only logging purposes.
 * @param {Function} factory.create
 *   Should create the item to be acquired,
 *   and call it's first callback argument with the generated item as it's argument.
 * @param {Function} factory.destroy
 *   Should gently close any resources that the item is using.
 *   Called before the items is destroyed.
 * @param {Function} factory.validate
 *   Should return true if connection is still valid and false
 *   If it should be removed from pool. Called before item is
 *   acquired from pool.
 * @param {Function} factory.validateAsync
 *   Asynchronous validate function. Receives a callback function
 *   as its second argument, that should be called with a single
 *   boolean argument being true if the item is still valid and false
 *   if it should be removed from pool. Called before item is
 *   acquired from pool. Only one of validate/validateAsync may be specified
 * @param {Number} factory.max
 *   Maximum number of items that can exist at the same time.  Default: 1.
 *   Any further acquire requests will be pushed to the waiting list.
 * @param {Number} factory.min
 *   Minimum number of items in pool (including in-use). Default: 0.
 *   When the pool is created, or a resource destroyed, this minimum will
 *   be checked. If the pool resource count is below the minimum, a new
 *   resource will be created and added to the pool.
 * @param {Number} factory.idleTimeoutMillis
 *   Delay in milliseconds after the idle items in the pool will be destroyed.
 *   And idle item is that is not acquired yet. Waiting items doesn't count here.
 * @param {Number} factory.reapIntervalMillis
 *   Cleanup is scheduled in every `factory.reapIntervalMillis` milliseconds.
 * @param {Boolean|Function} factory.log
 *   Whether the pool should log activity. If function is specified,
 *   that will be used instead. The function expects the arguments msg, loglevel
 * @param {Number} factory.priorityRange
 *   The range from 1 to be treated as a valid priority
 * @param {RefreshIdle} factory.refreshIdle
 *   Should idle resources be destroyed and recreated every idleTimeoutMillis? Default: true.
 * @param {Bool} [factory.returnToHead=false]
 *   Returns released object to head of available objects list
 */
function Pool (factory) {
  if (!(this instanceof Pool)) {
    return new Pool(factory)
  }

  if (factory.validate && factory.validateAsync) {
    throw new Error('Only one of validate or validateAsync may be specified')
  }

  // defaults
  factory.idleTimeoutMillis = factory.idleTimeoutMillis || 30000
  factory.returnToHead = factory.returnToHead || false
  factory.refreshIdle = ('refreshIdle' in factory) ? factory.refreshIdle : true
  factory.reapInterval = factory.reapIntervalMillis || 1000
  factory.priorityRange = factory.priorityRange || 1
  factory.validate = factory.validate || function () { return true }

  factory.max = parseInt(factory.max, 10)
  factory.min = parseInt(factory.min, 10)

  factory.max = Math.max(isNaN(factory.max) ? 1 : factory.max, 1)
  factory.min = Math.min(isNaN(factory.min) ? 0 : factory.min, factory.max - 1)

  this._factory = factory
  this._inUseObjects = []
  this._draining = false
  this._waitingClients = new PriorityQueue(factory.priorityRange)
  this._availableObjects = []
  this._count = 0
  this._removeIdleTimer = null
  this._removeIdleScheduled = false

  // create initial resources (if factory.min > 0)
  this._ensureMinimum()
}

/**
 * logs to console or user defined log function
 * @private
 * @param {string} str
 * @param {string} level
 */
Pool.prototype._log = function log (str, level) {
  if (typeof this._factory.log === 'function') {
    this._factory.log(str, level)
  } else if (this._factory.log) {
    console.log(level.toUpperCase() + ' pool ' + this._factory.name + ' - ' + str)
  }
}

/**
 * Request the client to be destroyed. The factory's destroy handler
 * will also be called.
 *
 * This should be called within an acquire() block as an alternative to release().
 *
 * @param {Object} obj
 *   The acquired item to be destoyed.
 */
Pool.prototype.destroy = function destroy (obj) {
  this._count -= 1
  if (this._count < 0) this._count = 0
  this._availableObjects = this._availableObjects.filter(function (objWithTimeout) {
    return (objWithTimeout.obj !== obj)
  })

  this._inUseObjects = this._inUseObjects.filter(function (objInUse) {
    return (objInUse !== obj)
  })

  this._factory.destroy(obj)

  this._ensureMinimum()
}

/**
 * Checks and removes the available (idle) clients that have timed out.
 * @private
 */
Pool.prototype._removeIdle = function removeIdle () {
  var toRemove = []
  var now = new Date().getTime()
  var i
  var al
  var tr
  var timeout

  this._removeIdleScheduled = false

  // Go through the available (idle) items,
  // check if they have timed out
  for (i = 0, al = this._availableObjects.length; i < al && (this._factory.refreshIdle && (this._count - this._factory.min > toRemove.length)); i += 1) {
    timeout = this._availableObjects[i].timeout
    if (now >= timeout) {
      // Client timed out, so destroy it.
      this._log('removeIdle() destroying obj - now:' + now + ' timeout:' + timeout, 'verbose')
      toRemove.push(this._availableObjects[i].obj)
    }
  }

  for (i = 0, tr = toRemove.length; i < tr; i += 1) {
    this.destroy(toRemove[i])
  }

  // Replace the available items with the ones to keep.
  al = this._availableObjects.length

  if (al > 0) {
    this._log('this._availableObjects.length=' + al, 'verbose')
    this._scheduleRemoveIdle()
  } else {
    this._log('removeIdle() all objects removed', 'verbose')
  }
}

/**
 * Schedule removal of idle items in the pool.
 *
 * More schedules cannot run concurrently.
 */
Pool.prototype._scheduleRemoveIdle = function scheduleRemoveIdle () {
  var self = this
  if (!this._removeIdleScheduled) {
    this._removeIdleScheduled = true
    this._removeIdleTimer = setTimeout(function () {
      self._removeIdle()
    }, this._factory.reapInterval)
  }
}

/**
 * Try to get a new client to work, and clean up pool unused (idle) items.
 *
 *  - If there are available clients waiting, shift the first one out (LIFO),
 *    and call its callback.
 *  - If there are no waiting clients, try to create one if it won't exceed
 *    the maximum number of clients.
 *  - If creating a new client would exceed the maximum, add the client to
 *    the wait list.
 * @private
 */
Pool.prototype._dispense = function dispense () {
  var self = this
  var objWithTimeout = null
  var err = null
  var clientCb = null
  var waitingCount = this._waitingClients.size()

  this._log('dispense() clients=' + waitingCount + ' available=' + this._availableObjects.length, 'info')
  if (waitingCount > 0) {
    if (this._factory.validateAsync) {
      doWhileAsync(function () {
        return self._availableObjects.length > 0
      }, function (next) {
        self._log('dispense() - reusing obj', 'verbose')
        objWithTimeout = self._availableObjects[0]

        self._factory.validateAsync(objWithTimeout.obj, function (valid) {
          if (!valid) {
            self.destroy(objWithTimeout.obj)
            next()
          } else {
            self._availableObjects.shift()
            self._inUseObjects.push(objWithTimeout.obj)
            clientCb = self._waitingClients.dequeue()
            clientCb(err, objWithTimeout.obj)
          }
        })
      }, function () {
        if (self._count < self._factory.max) {
          self._createResource()
        }
      })

      return
    }

    while (this._availableObjects.length > 0) {
      this._log('dispense() - reusing obj', 'verbose')
      objWithTimeout = this._availableObjects[0]
      if (!this._factory.validate(objWithTimeout.obj)) {
        this.destroy(objWithTimeout.obj)
        continue
      }
      this._availableObjects.shift()
      this._inUseObjects.push(objWithTimeout.obj)
      clientCb = this._waitingClients.dequeue()
      return clientCb(err, objWithTimeout.obj)
    }
    if (this._count < this._factory.max) {
      this._createResource()
    }
  }
}

/**
 * @private
 */
Pool.prototype._createResource = function _createResource () {
  this._count += 1
  this._log('createResource() - creating obj - count=' + this._count + ' min=' + this._factory.min + ' max=' + this._factory.max, 'verbose')
  var self = this
  this._factory.create(function () {
    var err, obj
    var clientCb = self._waitingClients.dequeue()
    if (arguments.length > 1) {
      err = arguments[0]
      obj = arguments[1]
    } else {
      err = (arguments[0] instanceof Error) ? arguments[0] : null
      obj = (arguments[0] instanceof Error) ? null : arguments[0]
    }
    if (err) {
      self._count -= 1
      if (self._count < 0) self._count = 0
      if (clientCb) {
        clientCb(err, obj)
      }
      process.nextTick(function () {
        self._dispense()
      })
    } else {
      self._inUseObjects.push(obj)
      if (clientCb) {
        clientCb(err, obj)
      } else {
        self.release(obj)
      }
    }
  })
}

/**
 * @private
 */
Pool.prototype._ensureMinimum = function _ensureMinimum () {
  var i, diff
  if (!this._draining && (this._count < this._factory.min)) {
    diff = this._factory.min - this._count
    for (i = 0; i < diff; i++) {
      this._createResource()
    }
  }
}

/**
 * Request a new client. The callback will be called,
 * when a new client will be availabe, passing the client to it.
 *
 * @param {Function} callback
 *   Callback function to be called after the acquire is successful.
 *   The function will receive the acquired item as the first parameter.
 *
 * @param {Number} priority
 *   Optional.  Integer between 0 and (priorityRange - 1).  Specifies the priority
 *   of the caller if there are no available resources.  Lower numbers mean higher
 *   priority.
 *
 * @returns {boolean} `true` if the pool is not fully utilized, `false` otherwise.
 */
Pool.prototype.acquire = function acquire (callback, priority) {
  if (this._draining) {
    throw new Error('pool is draining and cannot accept work')
  }
  if (process.domain) {
    callback = process.domain.bind(callback)
  }
  this._waitingClients.enqueue(callback, priority)
  this._dispense()
  return (this._count < this._factory.max)
}

/**
 * @deprecated
 */
Pool.prototype.borrow = function borrow (callback, priority) {
  this._log('borrow() is deprecated. use acquire() instead', 'warn')
  this.acquire(callback, priority)
}

/**
 * Return the client to the pool, in case it is no longer required.
 *
 * @param {Object} obj
 *   The acquired object to be put back to the pool.
 */
Pool.prototype.release = function release (obj) {
  // check to see if this object has already been released (i.e., is back in the pool of this._availableObjects)
  if (this._availableObjects.some(function (objWithTimeout) { return (objWithTimeout.obj === obj) })) {
    this._log('release called twice for the same resource: ' + (new Error().stack), 'error')
    return
  }

  // check to see if this object exists in the `in use` list and remove it
  var index = this._inUseObjects.indexOf(obj)
  if (index < 0) {
    this._log('attempt to release an invalid resource: ' + (new Error().stack), 'error')
    return
  }

  // this._log("return to pool")
  this._inUseObjects.splice(index, 1)
  var objWithTimeout = { obj: obj, timeout: (new Date().getTime() + this._factory.idleTimeoutMillis) }
  if (this._factory.returnToHead) {
    this._availableObjects.splice(0, 0, objWithTimeout)
  } else {
    this._availableObjects.push(objWithTimeout)
  }
  this._log('timeout: ' + objWithTimeout.timeout, 'verbose')
  this._dispense()
  this._scheduleRemoveIdle()
}

/**
 * @deprecated
 */
Pool.prototype.returnToPool = function returnToPool (obj) {
  this._log('returnToPool() is deprecated. use release() instead', 'warn')
  this.release(obj)
}

/**
 * Disallow any new requests and let the request backlog dissapate.
 *
 * @param {Function} callback
 *   Optional. Callback invoked when all work is done and all clients have been
 *   released.
 */
Pool.prototype.drain = function drain (callback) {
  this._log('draining', 'info')

  // disable the ability to put more work on the queue.
  this._draining = true

  var self = this
  var check = function () {
    if (self._waitingClients.size() > 0) {
      // wait until all client requests have been satisfied.
      setTimeout(check, 100)
    } else if (self._availableObjects.length !== self._count) {
      // wait until all objects have been released.
      setTimeout(check, 100)
    } else if (callback) {
      callback()
    }
  }
  check()
}

/**
 * Forcibly destroys all clients regardless of timeout.  Intended to be
 * invoked as part of a drain.  Does not prevent the creation of new
 * clients as a result of subsequent calls to acquire.
 *
 * Note that if factory.min > 0, the pool will destroy all idle resources
 * in the pool, but replace them with newly created resources up to the
 * specified factory.min value.  If this is not desired, set factory.min
 * to zero before calling destroyAllNow()
 *
 * @param {Function} callback
 *   Optional. Callback invoked after all existing clients are destroyed.
 */
Pool.prototype.destroyAllNow = function destroyAllNow (callback) {
  this._log('force destroying all objects', 'info')
  var willDie = this._availableObjects
  this._availableObjects = []
  var obj = willDie.shift()
  while (obj !== null && obj !== undefined) {
    this.destroy(obj.obj)
    obj = willDie.shift()
  }
  this._removeIdleScheduled = false
  clearTimeout(this._removeIdleTimer)
  if (callback) {
    callback()
  }
}

/**
 * Decorates a function to use a acquired client from the object pool when called.
 *
 * @param {Function} decorated
 *   The decorated function, accepting a client as the first argument and
 *   (optionally) a callback as the final argument.
 *
 * @param {Number} priority
 *   Optional.  Integer between 0 and (priorityRange - 1).  Specifies the priority
 *   of the caller if there are no available resources.  Lower numbers mean higher
 *   priority.
 */
Pool.prototype.pooled = function pooled (decorated, priority) {
  var self = this
  return function () {
    var callerArgs = arguments
    var callerCallback = callerArgs[callerArgs.length - 1]
    var callerHasCallback = typeof callerCallback === 'function'
    self.acquire(function (err, client) {
      if (err) {
        if (callerHasCallback) {
          callerCallback(err)
        }
        return
      }

      var args = [client].concat(Array.prototype.slice.call(callerArgs, 0, callerHasCallback ? -1 : undefined))
      args.push(function () {
        self.release(client)
        if (callerHasCallback) {
          callerCallback.apply(null, arguments)
        }
      })

      decorated.apply(null, args)
    }, priority)
  }
}

Pool.prototype.getPoolSize = function getPoolSize () {
  return this._count
}

Pool.prototype.getName = function getName () {
  return this._factory.name
}

Pool.prototype.availableObjectsCount = function availableObjectsCount () {
  return this._availableObjects.length
}

Pool.prototype.inUseObjectsCount = function inUseObjectsCount () {
  return this._inUseObjects.length
}

Pool.prototype.waitingClientsCount = function waitingClientsCount () {
  return this._waitingClients.size()
}

Pool.prototype.getMaxPoolSize = function getMaxPoolSize () {
  return this._factory.max
}

Pool.prototype.getMinPoolSize = function getMinPoolSize () {
  return this._factory.min
}

exports.Pool = Pool
