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

PriorityQueue.prototype.dequeue = function dequeue () {
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

PriorityQueue.prototype.peek = function peek () {
  var obj = null
  for (var i = 0, sl = this._slots.length; i < sl; i += 1) {
    if (this._slots[i].length) {
      obj = this._slots[i]
      break
    }
  }
  return obj
}

exports.PriorityQueue = PriorityQueue

// FIXME: this can blow the stack if the conditionFn is always true
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
 * @class
 * @private
 */
function ResourceRequest (requestCallback, ttl) {
  // requestCallback - callback registered by user that will either be be given an err
  // or instance of a requested resource
  // ttl - milliseconds till request times out (optional)
  if (typeof requestCallback !== 'function') {
    throw new Error('requestCallback is required and must be of type function')
  }

  // TODO: expose via getter?
  this.fulfilled = false
  this._requestCallback = requestCallback
  this._creationTimestamp = Date.now()
  this._timeout = null

  if (ttl !== undefined) {
    this.setTimeout(ttl)
  }
}

ResourceRequest.prototype.setTimeout = function (delay) {
  if (this.fulfilled) {
    throw new Error('ResourceRequest already fulfilled')
  }
  var ttl = parseInt(delay, 10)

  if (isNaN(ttl) || ttl <= 0) {
    throw new Error('delay must be a positive int')
  }

  var age = Date.now() - this._creationTimestamp
  var timeoutHandler = this._fireTimeout.bind(this)

  if (this._timeout) {
    this.removeTimeout()
  }

  if (age > ttl) {
    setImmediate(timeoutHandler)
  } else {
    this._timeout = setTimeout(timeoutHandler, ttl - age)
  }
}

ResourceRequest.prototype.removeTimeout = function () {
  clearTimeout(this._timeout)
  this._timeout = null
}

ResourceRequest.prototype._fireTimeout = function () {
  this.fulfill(new Error('ResourceRequest timed out'))
}

ResourceRequest.prototype.fulfill = function (err, resource) {
  if (this.fulfilled) {
    throw new Error('ResourceRequest already fulfilled')
  }

  this.fulfilled = true
  this.removeTimeout()
  // TODO: we explicitly null here for API/test compatibility... ditch in next major version bump
  if (err) {
    resource = null
  }
  // TODO: document need to 'bind' if context is used by user code
  // TODO: check if we can apply(null...) here to remove our own context
  // without trashing bind
  this._requestCallback(err, resource)
}

exports.ResourceRequest = ResourceRequest

/**
 * @class
 * @private
 */
function PooledResource (resource) {
  var now = Date.now()
  this.creationTime = now
  this.lastReturnTime = now
  this.lastBorrowTime = now
  this.obj = resource
}

// mark the resource as "allocated"
PooledResource.prototype.allocate = function allocate () {
  this.lastBorrowTime = Date.now()
}

// mark the resource as "deallocated"
PooledResource.prototype.deallocate = function deallocate () {
  this.lastReturnTime = Date.now()
}

exports.PooledResource = PooledResource


/**
 * Create the default settings used by the pool
 * @class
 * 
 */
function PoolDefaults(){

  this.idleTimeoutMillis = 30000
  this.returnToHead = false
  this.refreshIdle = true
  this.reapIntervalMillis = 1000
  this.priorityRange = 1
  this.validate = function () { return true }

  // FIXME: no defaults!
  this.acquireTimeoutMillis = null
  this.maxWaitingClients = null

  this.min = null
  this.max = null
}

exports.PoolDefaults = PoolDefaults

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
 * @param {Number} factory.maxWaitingClients
 *   maximum number of queued requests allowed after which acquire calls will be rejected
 * @param {Number} factory.idleTimeoutMillis
 *   Delay in milliseconds after the idle items in the pool will be destroyed.
 *   And idle item is that is not acquired yet. Waiting items doesn't count here.
 * @param {Number} factory.reapIntervalMillis
 *   Cleanup is scheduled in every `factory.reapIntervalMillis` milliseconds.
 * @param {Number} factory.acquireTimeoutMillis
 *   Delay in milliseconds after which the an `acquire` call will fail. optional.
 *   Default: undefined. Should be positive and non-zero
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

  var poolDefaults = new PoolDefaults()

  // defaults
  factory.idleTimeoutMillis = factory.idleTimeoutMillis || poolDefaults.idleTimeoutMillis
  factory.returnToHead = factory.returnToHead || poolDefaults.returnToHead
  factory.refreshIdle = ('refreshIdle' in factory) ? factory.refreshIdle : poolDefaults.refreshIdle
  factory.reapInterval = factory.reapIntervalMillis || poolDefaults.reapIntervalMillis
  factory.priorityRange = factory.priorityRange || poolDefaults.priorityRange
  factory.validate = factory.validate || poolDefaults.validate

  if (factory.acquireTimeoutMillis) {
    factory.acquireTimeoutMillis = parseInt(factory.acquireTimeoutMillis, 10)
  }

  if (factory.maxWaitingClients) {
    factory.maxWaitingClients = parseInt(factory.maxWaitingClients, 10)
  }

  factory.max = parseInt(factory.max, 10)
  factory.min = parseInt(factory.min, 10)

  factory.max = Math.max(isNaN(factory.max) ? 1 : factory.max, 1)
  factory.min = Math.min(isNaN(factory.min) ? 0 : factory.min, factory.max)

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
 * Request the resource to be destroyed. The factory's destroy handler
 * will also be called.
 *
 * This should be called within an acquire() block as an alternative to release().
 *
 * @param {Object} resource
 *   The acquired resource to be destoyed.
 */
Pool.prototype.destroy = function destroy (resource) {
  this._count -= 1
  if (this._count < 0) this._count = 0
  this._availableObjects = this._availableObjects.filter(_filterPooledResource)

  this._inUseObjects = this._inUseObjects.filter(_filterPooledResource)

  this._factory.destroy(resource)

  this._ensureMinimum()

  function _filterPooledResource (pooledResource) {
    return (pooledResource.obj !== resource)
  }
}

/**
 * Checks and removes the available (idle) resources that have timed out.
 * @private
 */
Pool.prototype._removeIdle = function removeIdle () {
  var toRemove = []
  var now = Date.now()
  var i
  var al
  var tr
  var idletime

  this._removeIdleScheduled = false

  // Go through the available (idle) items,
  // check if they have timed out
  for (i = 0, al = this._availableObjects.length; i < al && (this._factory.refreshIdle && (this._count - this._factory.min > toRemove.length)); i += 1) {
    idletime = now - this._availableObjects[i].lastReturnTime
    if (idletime >= this._factory.idleTimeoutMillis) {
      // Client timed out, so destroy it.
      this._log('removeIdle() destroying obj - now:' + now + ' timeout:' + (this._availableObjects[i].lastReturnTime + this._factory.idleTimeoutMillis), 'verbose')
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
    this._removeIdleTimer = setTimeout(_onIdleTimeout, this._factory.reapInterval)
  }

  function _onIdleTimeout () {
    self._removeIdle()
  }
}

/**
 * Attempt to fulfil a resource request using an available resource from
 * the pool. Once the request is either fulfilled or no resources are found to be usable,
 * if there are any more requests outstanding, trigger further resource creation
 *
 * @private
 */
Pool.prototype._dispense = function dispense () {
  var self = this
  var pooledResource = null
  var err = null
  var resourceRequest = null
  var waitingCount = this._waitingClients.size()

  function _topUpResources () {
    if (self._count < self._factory.max) {
      self._createResource()
    }
  }

  function _whileCondition () {
    return self._availableObjects.length > 0
  }

  function _asyncValidationIterator (next) {
    self._log('dispense() - reusing obj', 'verbose')
    var pooledResource = self._availableObjects[0]

    self._factory.validateAsync(pooledResource.obj, _validatationCallback)

    function _validatationCallback (isValid) {
      if (!isValid) {
        self.destroy(pooledResource.obj)
        next()
      } else {
        self._availableObjects.shift()
        self._inUseObjects.push(pooledResource)
        pooledResource.allocate()
        resourceRequest = self._waitingClients.dequeue()
        resourceRequest.fulfill(null, pooledResource.obj)
      }
    }
  }

  // Get a valid and non-timed out resource request
  // FIXME: what happens if we grab the request but then it times out
  // before async validation can occur?

  // TODO: rename 'clients' to resource requests or similiar when we next bump major
  this._log('dispense() clients=' + waitingCount + ' available=' + this._availableObjects.length, 'info')
  if (waitingCount > 0) {
    if (this._factory.validateAsync) {
      doWhileAsync(_whileCondition, _asyncValidationIterator, _topUpResources)
      return
    }

    while (_whileCondition()) {
      this._log('dispense() - reusing obj', 'verbose')
      // FIXME: block scope variable wanted
      pooledResource = this._availableObjects[0]
      if (!this._factory.validate(pooledResource.obj)) {
        this.destroy(pooledResource.obj)
        continue
      }
      this._availableObjects.shift()
      this._inUseObjects.push(pooledResource)
      pooledResource.allocate()
      resourceRequest = this._waitingClients.dequeue()
      return resourceRequest.fulfill(err, pooledResource.obj)
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
  this._factory.create(_factoryCallback)

  function _factoryCallback () {
    var err, obj, pooledResource, resourceRequest, uncheckedResourceRequest

    if (arguments.length > 1) {
      err = arguments[0]
      obj = arguments[1]
    } else {
      err = (arguments[0] instanceof Error) ? arguments[0] : null
      obj = (arguments[0] instanceof Error) ? null : arguments[0]
    }

    // FIXME: hack to skip any timed out resourceRequests still lingering in
    // the waiting client list
    while (self._waitingClients.size() > 0 && resourceRequest === undefined) {
      uncheckedResourceRequest = self._waitingClients.dequeue()
      if (uncheckedResourceRequest.fulfilled === false) {
        resourceRequest = uncheckedResourceRequest
      }
    }

    if (err) {
      self._count -= 1
      if (self._count < 0) self._count = 0
      // FIXME: This should be emitted or at least exposed to userland
      // As a quick hack we'll at least log an error.
      self._log('error creating a resource: ' + err.message, 'error')
      process.nextTick(function () {
        self._dispense()
      })
      return
    }
    pooledResource = new PooledResource(obj)
    self._inUseObjects.push(pooledResource)
    if (resourceRequest) {
      pooledResource.allocate()
      resourceRequest.fulfill(null, pooledResource.obj)
    } else {
      self.release(pooledResource.obj)
    }
  }
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
 * Request a new resource. The callback will be called,
 * when a new resource is availabe, passing the resource to the callback.
 *
 * @param {Function} callback
 *   Callback function to be called after the acquire is successful.
 *   If there is an error preventing the acquisition of resource, an error will
 *   be the first parameter, else it will be null.
 *   The acquired resource will be the second parameter.
 *
 * @param {Number} priority
 *   Optional.  Integer between 0 and (priorityRange - 1).  Specifies the priority
 *   of the caller if there are no available resources.  Lower numbers mean higher
 *   priority.
 *
 * @returns {boolean} `true` if the pool is not fully utilized, `false` otherwise.
 */
Pool.prototype.acquire = function acquire (callback, priority) {
  var self = this

  if (this._draining) {
    throw new Error('pool is draining and cannot accept work')
  }

  if (this._factory.maxWaitingClients !== undefined && this._waitingClients.size() >= this._factory.maxWaitingClients) {
    // NOTE: we return the error outside the current continuation so we do not zalgo users and to provider some
    // value
    // if synchronous checking is required it can be done manually with .size()
    // FIXME: once we depreciate node 0.6 we can move to setImmediate
    setTimeout(function () {
      return callback(new Error('max waitingClients count exceeded'))
    }, 0)
    return
  }

  var request = new ResourceRequest(callback, this._factory.acquireTimeoutMillis)
  this._waitingClients.enqueue(request, priority)
  process.nextTick(function () {
    self._dispense()
  })
  return (this._count < this._factory.max)
}

/**
 * Return the resource to the pool when it is no longer required.
 *
 * @param {Object} obj
 *   The acquired object to be put back to the pool.
 */
Pool.prototype.release = function release (resource) {
  var self = this
  // check to see if this object has already been released (i.e., is back in the pool of this._availableObjects)
  if (this._availableObjects.some(_somePooledResource)) {
    this._log('release called twice for the same resource: ' + (new Error().stack), 'error')
    return
  }

  // NOTE: this is basically, does the resource belong to this pooledResource, but names..
  function _somePooledResource (pooledResource) {
    return (pooledResource.obj === resource)
  }

  // ES5 compat hack for ES6 findIndex
  // Once we go ES6 and use a Map this can all go away
  function _findIndex (pos, pooledResource, idx) {
    if (pooledResource.obj === resource) {
      return idx
    } else {
      return pos
    }
  }

  // check to see if this object exists in the `in use` list and remove it
  var index = this._inUseObjects.reduce(_findIndex, -1)
  if (index < 0) {
    this._log('attempt to release an invalid resource: ' + (new Error().stack), 'error')
    return
  }

  // this._log("return to pool")
  // FIXME: this is an awful hardocoded assumption
  var pooledResource = this._inUseObjects.splice(index, 1)[0]
  pooledResource.deallocate()
  if (this._factory.returnToHead) {
    this._availableObjects.splice(0, 0, pooledResource)
  } else {
    this._availableObjects.push(pooledResource)
  }
  this._log('timeout: ' + (Date.now() + this._factory.idleTimeoutMillis), 'verbose')
  // FIXME: either this should be called next eventloop, or _dispense should do it itself
  process.nextTick(function () {
    self._dispense()
  })
  this._scheduleRemoveIdle()
}

/**
 * Disallow any new requests and let the request backlog dissapate.
 *
 * @param {Function} callback
 *   Optional. Callback invoked when all work is done and all resources have been
 *   released.
 */
Pool.prototype.drain = function drain (callback) {
  this._log('draining', 'info')

  // disable the ability to put more work on the queue.
  this._draining = true

  var self = this
  var check = function () {
    if (self._waitingClients.size() > 0) {
      // wait until all resource requests have been satisfied.
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
 * Forcibly destroys all resources regardless of timeout.  Intended to be
 * invoked as part of a drain.  Does not prevent the creation of new
 * resources as a result of subsequent calls to acquire.
 *
 * Note that if factory.min > 0, the pool will destroy all idle resources
 * in the pool, but replace them with newly created resources up to the
 * specified factory.min value.  If this is not desired, set factory.min
 * to zero before calling destroyAllNow()
 *
 * @param {Function} callback
 *   Optional. Callback invoked after all existing resources are destroyed.
 */
Pool.prototype.destroyAllNow = function destroyAllNow (callback) {
  this._log('force destroying all objects', 'info')
  var willDie = this._availableObjects
  this._availableObjects = []
  var pooledResource = willDie.shift()
  while (pooledResource !== null && pooledResource !== undefined) {
    this.destroy(pooledResource.obj)
    pooledResource = willDie.shift()
  }
  this._removeIdleScheduled = false
  clearTimeout(this._removeIdleTimer)
  if (callback) {
    callback()
  }
}

/**
 * Decorates a function to use a acquired resource from the object pool when called.
 *
 * @param {Function} decorated
 *   The decorated function, accepting a resource as the first argument and
 *   (optionally) a callback as the final argument.
 *
 * @param {Number} priority
 *   Optional.  Integer between 0 and (priorityRange - 1).  Specifies the priority
 *   of the caller if there are no available resources.  Lower numbers mean higher
 *   priority.
 */
Pool.prototype.pooled = function pooled (decorated, priority) {
  var self = this
  // TODO: should this be named to improve debugging?
  return function () {
    var callerArgs = arguments
    var callerCallback = callerArgs[callerArgs.length - 1]
    var callerHasCallback = typeof callerCallback === 'function'
    self.acquire(_onAcquire, priority)

    function _onAcquire (err, resource) {
      if (err) {
        if (callerHasCallback) {
          callerCallback(err)
        }
        return
      }

      var args = [resource].concat(Array.prototype.slice.call(callerArgs, 0, callerHasCallback ? -1 : undefined))
      args.push(_wrappedCallback)

      decorated.apply(null, args)

      function _wrappedCallback () {
        self.release(resource)
        if (callerHasCallback) {
          callerCallback.apply(null, arguments)
        }
      }
    }
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
