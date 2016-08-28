'use strict'

var PoolDefaults = require('./PoolDefaults')
var PooledResourceCollection = require('./PooledResourceCollection')
var PriorityQueue = require('./PriorityQueue')
var ResourceRequest = require('./ResourceRequest')
var PooledResource = require('./PooledResource')
var PooledResourceStateEnum = require('./PooledResourceStateEnum')
var utils = require('./utils')

// convenience
var nextLoop = utils.nextLoop

/**
 * Generate an Object pool with a specified `factory` and `config`.
 *
 * @class
 *
 * @param {Object} factory
 *   Factory to be used for generating and destroying the items.
 * @param {Function} factory.create
 *   Should create the item to be acquired,
 *   and call it's first callback argument with the generated item as it's argument.
 * @param {Function} factory.destroy
 *   Should gently close any resources that the item is using.
 *   Called before the items is destroyed.
 * @param {Function} factory.validate
 *   Test if a resource is still valid .Should return true if resource is still valid and false
 *   If it should be removed from pool.
 * @param {Function} factory.validateAsync
 *   Asynchronous validate function. Receives a callback function
 *   as its second argument, that should be called with a single
 *   boolean argument being true if the item is still valid and false
 *   if it should be removed from pool.
 *   Only one of validate/validateAsync may be specified
 *
 * @param {Object} config
 *   configuration for the pool
 * @param {String} config.name
 *   Name of the factory. Serves only logging purposes.
 * @param {Number} config.max
 *   Maximum number of items that can exist at the same time.  Default: 1.
 *   Any further acquire requests will be pushed to the waiting list.
 * @param {Number} config.min
 *   Minimum number of items in pool (including in-use). Default: 0.
 *   When the pool is created, or a resource destroyed, this minimum will
 *   be checked. If the pool resource count is below the minimum, a new
 *   resource will be created and added to the pool.
 * @param {Number} config.maxWaitingClients
 *   maximum number of queued requests allowed after which acquire calls will be rejected
 * @param {Number} config.idleTimeoutMillis
 *   Delay in milliseconds after the idle items in the pool will be destroyed.
 *   And idle item is that is not acquired yet. Waiting items doesn't count here.
 * @param {Number} config.reapIntervalMillis
 *   Cleanup is scheduled in every `config.reapIntervalMillis` milliseconds.
 * @param {Number} config.acquireTimeoutMillis
 *   Delay in milliseconds after which the an `acquire` call will fail. optional.
 *   Default: undefined. Should be positive and non-zero
 * @param {Boolean|Function} config.log
 *   Whether the pool should log activity. If function is specified,
 *   that will be used instead. The function expects the arguments msg, loglevel
 * @param {Number} config.priorityRange
 *   The range from 1 to be treated as a valid priority
 * @param {RefreshIdle} config.refreshIdle
 *   Should idle resources be destroyed and recreated every idleTimeoutMillis? Default: true.
 * @param {Bool} [config.returnToHead=false]
 *   Returns released object to head of available objects list
 */
function Pool (factory, config) {
  // TODO: can/should we remove this non-constructor call check?
  if (!(this instanceof Pool)) {
    return new Pool(factory, config)
  }

  if (factory.validate && factory.validateAsync) {
    throw new Error('Only one of validate or validateAsync may be specified')
  }

  var poolDefaults = new PoolDefaults()

  var _config = config || {}

  this._config = {}

  // defaults
  this._config.name = _config.name || poolDefaults.name
  this._config.idleTimeoutMillis = _config.idleTimeoutMillis || poolDefaults.idleTimeoutMillis
  this._config.returnToHead = _config.returnToHead || poolDefaults.returnToHead
  this._config.refreshIdle = ('refreshIdle' in _config) ? _config.refreshIdle : poolDefaults.refreshIdle
  this._config.reapInterval = _config.reapIntervalMillis || poolDefaults.reapIntervalMillis
  this._config.priorityRange = _config.priorityRange || poolDefaults.priorityRange

  this._config.testOnBorrow = (typeof _config.testOnBorrow === 'boolean') ? _config.testOnBorrow : poolDefaults.testOnBorrow
  this._config.testOnReturn = (typeof _config.testOnReturn === 'boolean') ? _config.testOnReturn : poolDefaults.testOnReturn

  this._config.log = _config.log || false

  // NOTE: for now we are making all testing async for simplicity
  // this might have a performance implication but we can solve that later
  if (factory.validate) {
    factory.validateAsync = utils.syncValidationWrapper(factory.validate)
  }

  if (_config.acquireTimeoutMillis) {
    this._config.acquireTimeoutMillis = parseInt(_config.acquireTimeoutMillis, 10)
  }

  if (_config.maxWaitingClients) {
    this._config.maxWaitingClients = parseInt(_config.maxWaitingClients, 10)
  }

  this._config.max = parseInt(_config.max, 10)
  this._config.min = parseInt(_config.min, 10)

  this._config.max = Math.max(isNaN(this._config.max) ? 1 : this._config.max, 1)
  this._config.min = Math.min(isNaN(this._config.min) ? 0 : this._config.min, this._config.max)

  this._factory = factory
  this._draining = false
  /**
   * Holds waiting clients
   * @type {PriorityQueue}
   */
  this._waitingClients = new PriorityQueue(this._config.priorityRange)

  /**
   * Collection of resourceRequests for resource creation calls made by the pool to the factory
   * @type {Array}
   */
  this._factoryResourceRequests = []

  /**
   * A queue/stack of pooledResources awaiting acquisition
   * @type {Array}
   */
  this._availableObjects = []

  /**
   * Collection of references for any resource that are undergoing validation
   * (only used if we have async validator and doing test-on-borrow)
   * @type {Array}
   */
  this._testOnBorrowResources = []

  /**
   * Collection of references for any resource that are undergoing validation
   * (only used if we have async validator and doing test-on-return)
   * @type {Array}
   */
  this._testOnReturnResources = []

  /**
   * All objects associated with this pool in any state (except destroyed)
   * FIXME: replace with es6-map key=object, value=PooledResource
   * @type {Array}
   */
  this._allObjects = new PooledResourceCollection()
  /**
   * The combined count of the currently created objects and those in the
   * process of being created
   * @type {Number}
   */
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
  if (typeof this._config.log === 'function') {
    this._config.log(str, level)
  } else if (this._config.log) {
    console.log(level.toUpperCase() + ' pool ' + this._config.name + ' - ' + str)
  }
}

Pool.prototype._destroy = function (pooledResource) {
  this._count -= 1
  if (this._count < 0) this._count = 0

  pooledResource.invalidate()
  this._allObjects.removeByResource(pooledResource.obj)
  this._factory.destroy(pooledResource.obj)
  this._ensureMinimum()
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
  for (i = 0, al = this._availableObjects.length; i < al && (this._config.refreshIdle && (this._count - this._config.min > toRemove.length)); i += 1) {
    idletime = now - this._availableObjects[i].lastReturnTime
    if (idletime >= this._config.idleTimeoutMillis) {
      // Client timed out, so destroy it.
      this._log('removeIdle() destroying obj - now:' + now + ' timeout:' + (this._availableObjects[i].lastReturnTime + this._config.idleTimeoutMillis), 'verbose')
      toRemove.push(this._availableObjects[i].obj)
    }
  }

  for (i = 0, tr = toRemove.length; i < tr; i += 1) {
    this._destroy(toRemove[i])
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
    this._removeIdleTimer = setTimeout(_onIdleTimeout, this._config.reapInterval)
  }

  function _onIdleTimeout () {
    self._removeIdle()
  }
}

/**
 * Attempt to move an available resource into test and then onto a waiting client
 * @return {Boolean} could we move an available resource into test
 */
Pool.prototype._testOnBorrow = function () {
  var self = this

  if (this._availableObjects.length < 1) {
    return false
  }

  var pooledResource = this._availableObjects.shift()
  // Mark the resource as in test
  pooledResource.test()
  this._testOnBorrowResources.push(pooledResource)
  this._factory.validateAsync(pooledResource.obj, _validationCallback)

  function _validationCallback (isValid) {
    // ugly... replace with Map/Set or at least something DLL backed that is optimised
    // for removing from the tail
    var _pos = self._testOnBorrowResources.indexOf(pooledResource)
    self._testOnBorrowResources.splice(_pos, 1)[0]

    if (isValid === false) {
      pooledResource.invalidate()
      self._destroy(pooledResource)
      // Kick of dispense again!
      self._dispense()
      return
    }
    self._dispatchPooledResourceToNextWaitingClient(pooledResource)
    return
  }

  return true
}

/**
 * Attempt to move an available resource to a waiting client
 * @return {Boolean} [description]
 */
Pool.prototype._dispatchResource = function () {
  if (this._availableObjects.length < 1) {
    return false
  }

  var pooledResource = this._availableObjects.shift()
  this._dispatchPooledResourceToNextWaitingClient(pooledResource)
  return
}

/**
 * Attempt to resolve an outstanding resource request using an available resource from
 * the pool.
 * Shuffles things through
 * TODO: rename this!
 *
 * @private
 */
Pool.prototype._dispense = function dispense () {
  // console.log('_dispense called')

  /**
   * Local variables for ease of reading/writing
   * these don't (shouldn't) change across the execution of this fn
   */
  var waitingClients = this._waitingClients.size()

  // If there aren't any waiting requests then there is nothing to do
  if (waitingClients < 1) {
    // console.log('dispense bailing - no waiting requests')
    return
  }

  // If we are doing test-on-borrow see how many more resources need to be moved into test
  // to help satisfy waitingClients
  if (this._config.testOnBorrow === true) {
    // console.log('dispense - entering test-on-borrow branch')
    // Could all the outstanding clients be fulfilled by resources under going test-on-borrow
    if (waitingClients <= this._testOnBorrowResources.length) {
      // console.log('dispense bailing - all waiting requests could be fulfilled by resources in test-on-borrow')
      return
    }
    // how many available resources do we need to shift into test
    // FIXME: block scope var please
    var desiredNumberOfResourcesToMoveIntoTest = waitingClients - this._testOnBorrowResources.length
    var actualNumberOfResourcesToMoveIntoTest = Math.min(this._availableObjects.length, desiredNumberOfResourcesToMoveIntoTest)
    for (;actualNumberOfResourcesToMoveIntoTest > 0; actualNumberOfResourcesToMoveIntoTest--) {
      this._testOnBorrow()
    }
    // console.log('dispense - leaving test-on-borrow branch')
  }

  // Do we still have outstanding requests that can't be fulfilled by resources in-test and available
  var potentiallyAllocableResources = this._availableObjects.length +
    this._testOnBorrowResources.length +
    this._testOnReturnResources.length +
    this._factoryResourceRequests.length

  var resourceShortfall = waitingClients - potentiallyAllocableResources

  if (resourceShortfall > 0) {
    // console.log('dispense - entering resource shortfall branch')
    var spareResourceCapacity = this._config.max - (this._allObjects.size() + this._factoryResourceRequests.length)

    if (spareResourceCapacity < 1) {
      // console.log('not enough allocable resources to satisfy all waiting clients and at max capacity')
    }

    var actualNumberOfResourcesToCreate = Math.min(spareResourceCapacity, resourceShortfall)
    for (;actualNumberOfResourcesToCreate > 0; actualNumberOfResourcesToCreate--) {
      this._createResource()
    }
    // console.log('dispense - leaving resource shortfall branch')
  }

  // if we aren't testing-on-borrow then lets try to allocate what we can
  if (this._config.testOnBorrow === false) {
    // console.log('dispense - entering non test-on-borrow branch')
    var actualNumberOfResourcesToDispatch = Math.min(this._availableObjects.length, waitingClients)
    for (;actualNumberOfResourcesToDispatch > 0; actualNumberOfResourcesToDispatch--) {
      this._dispatchResource()
    }
    // console.log('dispense - leaving non test-on-borrow branch')
  }
  // console.log('dispense finished')
}

/**
 * Dispatches a pooledResource to the next waiting client (if any) else
 * puts the PooledResource back on the available list
 * @param  {[type]} pooledResource [description]
 * @return {[type]}                [description]
 */
Pool.prototype._dispatchPooledResourceToNextWaitingClient = function (pooledResource) {
  var clientResourceRequest = this._waitingClients.dequeue()
  if (clientResourceRequest === null) {
    // While we were away either all the waiting clients timed out
    // or were somehow fulfilled. put our pooledResource back.
    pooledResource.idle()
    this._addPooledResourceToAvailableObjects(pooledResource)
    // TODO: do need to trigger anything before we leave?
    return false
  }
  pooledResource.allocate()
  // TODO: should we nextLoop this?
  clientResourceRequest.resolve(pooledResource.obj)
  return true
}

/**
 * @private
 */
Pool.prototype._createResource = function _createResource () {
  this._count += 1
  this._log('createResource() - creating obj - count=' + this._count + ' min=' + this._config.min + ' max=' + this._config.max, 'verbose')
  var self = this
  var factoryResourceRequest = new ResourceRequest(_factoryCallback)
  this._factoryResourceRequests.push(factoryResourceRequest)

  // Glue to from callback -> promishish -> callback
  this._factory.create(function (err, resource) {
    // Remove factoryResourceRequest list
    self._factoryResourceRequests = self._factoryResourceRequests.filter(_isNotFactoryThisResourceRequest)

    if (err) {
      return factoryResourceRequest.reject(err)
    }
    factoryResourceRequest.resolve(resource)
  })

  function _factoryCallback (err, obj) {
    self._log('createResource() - created obj - count=' + self._count + ' min=' + self._config.min + ' max=' + self._config.max, 'verbose')

    if (err) {
      self._count -= 1
      if (self._count < 0) self._count = 0
      // FIXME: This should be emitted or at least exposed to userland
      // As a quick hack we'll at least log an error.
      self._log('error creating a resource: ' + err.message, 'error')
      nextLoop(function () {
        self._dispense()
      })
      return
    }
    self._handleNewResource(obj)
  }
  // FIXME: this name is awful
  function _isNotFactoryThisResourceRequest (frr) {
    return factoryResourceRequest !== frr
  }
}

Pool.prototype._handleNewResource = function (resource) {
  var pooledResource = new PooledResource(resource)
  this._allObjects.addPooledResource(pooledResource)
  var resourceRequest = this._waitingClients.dequeue()
    // If there are no waiting client requests anymore then
    // just add to our available list
    // TODO: check we aren't exceding our maxPoolSize before doing this
  if (resourceRequest) {
    pooledResource.allocate()
    resourceRequest.resolve(pooledResource.obj)
  } else {
    this._addPooledResourceToAvailableObjects(pooledResource)
  }
}

/**
 * @private
 */
Pool.prototype._ensureMinimum = function _ensureMinimum () {
  var i, diff
  if (!this._draining && (this._count < this._config.min)) {
    diff = this._config.min - this._count
    for (i = 0; i < diff; i++) {
      this._createResource()
    }
  }
}

/**
 * Request a new resource. The callback will be called,
 * when a new resource is available, passing the resource to the callback.
 * TODO: should we add a seperate "acquireWithPriority" function
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

  // TODO: should we defer this check till after this event loop incase "the situation" changes in the meantime
  if (this._config.maxWaitingClients !== undefined && this._waitingClients.size() >= this._config.maxWaitingClients) {
    // NOTE: we return the error outside the current continuation so we do not zalgo users and to provider some
    // value
    // TODO: should "reject" the resourceRequest instead and/or as well?
    // NOTE: if synchronous checking is required it can be done manually with .size()
    nextLoop(function () {
      return callback(new Error('max waitingClients count exceeded'))
    })
    return
  }

  var request = new ResourceRequest(callback, this._config.acquireTimeoutMillis)
  this._waitingClients.enqueue(request, priority)
  nextLoop(function () {
    self._dispense()
  })
  // TODO: check if exposing our internal ResourceRequest is going to be problematic
  // maybe only expose it if no callback is supplied
  return request
}

/**
 * Return the resource to the pool when it is no longer required.
 *
 * @param {Object} obj
 *   The acquired object to be put back to the pool.
 */
Pool.prototype.release = function release (resource) {
  var self = this

  // check to see if this object exists in the global list of resources
  // if it's not here then it's not a resource we know about
  var pooledResource = this._allObjects.getByResource(resource)

  if (pooledResource === null) {
    this._log('attempt to release an invalid resource: ' + (new Error().stack), 'error')
    return
  }

  // check to see if this object has already been released (i.e., is back in the pool of this._availableObjects)
  // FIXME: We can avoid this expensive test by tracking state on the pooledResource instead
  if (this._availableObjects.indexOf(pooledResource) > -1) {
    this._log('release called twice for the same resource: ' + (new Error().stack), 'error')
    return
  }



  pooledResource.deallocate()
  this._addPooledResourceToAvailableObjects(pooledResource)
  // Why is this being logged?
  this._log('timeout: ' + (Date.now() + this._config.idleTimeoutMillis), 'verbose')
  this._scheduleRemoveIdle()
  nextLoop(function () {
    self._dispense()
  })
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
  var pooledResource = this._allObjects.getByResource(resource)

  if (pooledResource === null) {
    throw new Error('Returned resource not part of this pool')
  }

  if (pooledResource.state !== PooledResourceStateEnum.ALLOCATED) {
    throw new Error('Resource has already been returned to this pool or is invalid')
  }

  pooledResource.deallocate()

  this._destroy(pooledResource)
}

// FIXME: replace _availableObjects with a queue/stack impl that both have same interface
Pool.prototype._addPooledResourceToAvailableObjects = function (pooledResource) {
  if (this._config.returnToHead) {
    this._availableObjects.splice(0, 0, pooledResource)
  } else {
    this._availableObjects.push(pooledResource)
  }
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
  // TODO: rather than check on timeout, can we move (some of) this check to
  // somewhere around/after pool.destroy / pool.release methods?
  var check = function () {
    if (self._waitingClients.size() > 0) {
      // wait until all resource requests have been satisfied.
      setTimeout(check, 100) // FIXME: magic number 100?
    } else if (self._availableObjects.length !== self._count) {
      // wait until all objects have been released.
      setTimeout(check, 100) // FIXME: magic number 100?
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
    this._destroy(pooledResource)
    pooledResource = willDie.shift()
  }
  this._removeIdleScheduled = false
  clearTimeout(this._removeIdleTimer)
  if (callback) {
    callback()
  }
}

/**
 * Decorates a function to use an acquired resource from the object pool when called.
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
  return this._config.name
}

Pool.prototype.availableObjectsCount = function availableObjectsCount () {
  return this._availableObjects.length
}

// NOTE: the returned value currently includes items in test
Pool.prototype.inUseObjectsCount = function inUseObjectsCount () {
  return this._allObjects.size() - this._availableObjects.length
}

Pool.prototype.waitingClientsCount = function waitingClientsCount () {
  return this._waitingClients.size()
}

Pool.prototype.getMaxPoolSize = function getMaxPoolSize () {
  return this._config.max
}

Pool.prototype.getMinPoolSize = function getMinPoolSize () {
  return this._config.min
}

module.exports = Pool
