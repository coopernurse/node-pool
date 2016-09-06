'use strict'

const EventEmitter = require('events').EventEmitter

const PoolDefaults = require('./PoolDefaults')
const PooledResourceCollection = require('./PooledResourceCollection')
const PriorityQueue = require('./PriorityQueue')
const ResourceRequest = require('./ResourceRequest')
const PooledResource = require('./PooledResource')
const PooledResourceStateEnum = require('./PooledResourceStateEnum')

class Pool extends EventEmitter {

  /**
   * Generate an Object pool with a specified `factory` and `config`.
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
   *   Test if a resource is still valid .Should return a promise that resolves to a boolean, true if resource is still valid and false
   *   If it should be removed from pool.
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
  constructor (factory, config) {
    super()

    const poolDefaults = new PoolDefaults()

    const _config = config || {}

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
     * Collection of promises for resource creation calls made by the pool to factory.create
     * @type {Set}
     */
    this._factoryCreateOperations = new Set()

    /**
     * Collection of promises for resource destruction calls made by the pool to factory.destroy
     * @type {Set}
     */
    this._factoryDestroyOperations = new Set()

    /**
     * A queue/stack of pooledResources awaiting acquisition
     * TODO: replace with LinkedList backed array
     * @type {Array}
     */
    this._availableObjects = []

    /**
     * Collection of references for any resource that are undergoing validation before being acquired
     * @type {Set}
     */
    this._testOnBorrowResources = new Set()

    /**
     * Collection of references for any resource that are undergoing validation before being returned
     * @type {Set}
     */
    this._testOnReturnResources = new Set()

    /**
     * Collection of promises for any validations currently in process
     * @type {Set}
     */
    this._validationOperations = new Set()

    /**
     * All objects associated with this pool in any state (except destroyed)
     * @type {PooledResourceCollection}
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
    // TODO: should move this to somewhere later?
    this._ensureMinimum()
  }

  /**
   * logs to console or user defined log function
   * @private
   * @param {string} str
   * @param {string} level
   */
  _log (str, level) {
    if (typeof this._config.log === 'function') {
      this._config.log(str, level)
    } else if (this._config.log) {
      console.log(level.toUpperCase() + ' pool ' + this._config.name + ' - ' + str)
    }
  }

  // TODO: does this need to return a Promise anymore since we are tracking
  // all destroyOps on the pool now?
  _destroy (pooledResource) {
    const executor = (resolve) => {
      this._count -= 1
      if (this._count < 0) { this._count = 0 }

      pooledResource.invalidate()
      this._allObjects.pooledResource(pooledResource)
      // NOTE: this maybe very bad promise usage?
      const destroyOp = this._factory.destroy(pooledResource.obj)
      this._factoryDestroyOperations.add(destroyOp)

      destroyOp.then(function () {
        this._factoryDestroyOperations.delete(destroyOp)
        resolve()
      })

      // TODO: maybe ensuring minimum pool size should live outside here
      this._ensureMinimum()
    }
    return new Promise(executor)
  }

  /**
   * Checks and removes the available (idle) resources that have timed out.
   * @private
   */
  _removeIdle () {
    const toRemove = []
    const now = Date.now()

    this._removeIdleScheduled = false

    // Go through the available (idle) items,
    // check if they have timed out
    for (let i = 0, al = this._availableObjects.length; i < al && (this._config.refreshIdle && (this._count - this._config.min > toRemove.length)); i += 1) {
      const idletime = now - this._availableObjects[i].lastReturnTime
      if (idletime >= this._config.idleTimeoutMillis) {
        // Client timed out, so destroy it.
        this._log('removeIdle() destroying obj - now:' + now + ' timeout:' + (this._availableObjects[i].lastReturnTime + this._config.idleTimeoutMillis), 'verbose')
        toRemove.push(this._availableObjects[i].obj)
      }
    }

    for (let j = 0, tr = toRemove.length; j < tr; j += 1) {
      this._destroy(toRemove[j])
    }

    // Replace the available items with the ones to keep.
    const al = this._availableObjects.length

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
  _scheduleRemoveIdle () {
    if (!this._removeIdleScheduled) {
      this._removeIdleScheduled = true
      this._removeIdleTimer = setTimeout(() => this._removeIdle(), this._config.reapInterval)
    }
  }

  /**
   * Attempt to move an available resource into test and then onto a waiting client
   * @return {Boolean} could we move an available resource into test
   */
  _testOnBorrow () {
    if (this._availableObjects.length < 1) {
      return false
    }

    const pooledResource = this._availableObjects.shift()
    // Mark the resource as in test
    pooledResource.test()
    this._testOnBorrowResources.add(pooledResource)
    const validationOp = this._factory.validate(pooledResource.obj)
    this._validationOperations.add(validationOp)

    validationOp.then((isValid) => {
      this._validationOperations.delete(validationOp)
      this._testOnBorrowResources.delete(pooledResource)

      if (isValid === false) {
        pooledResource.invalidate()
        this._destroy(pooledResource)
        this._dispense()
        return
      }
      this._dispatchPooledResourceToNextWaitingClient(pooledResource)
    })

    return true
  }

  /**
   * Attempt to move an available resource to a waiting client
   * @return {Boolean} [description]
   */
  _dispatchResource () {
    if (this._availableObjects.length < 1) {
      return false
    }

    const pooledResource = this._availableObjects.shift()
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
  _dispense () {
    // console.log('_dispense called')

    /**
     * Local variables for ease of reading/writing
     * these don't (shouldn't) change across the execution of this fn
     */
    const waitingClients = this._waitingClients.size()

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
      if (waitingClients <= this._testOnBorrowResources.size) {
        // console.log('dispense bailing - all waiting requests could be fulfilled by resources in test-on-borrow')
        return
      }
      // how many available resources do we need to shift into test
      const desiredNumberOfResourcesToMoveIntoTest = waitingClients - this._testOnBorrowResources.size
      const actualNumberOfResourcesToMoveIntoTest = Math.min(this._availableObjects.length, desiredNumberOfResourcesToMoveIntoTest)
      for (let i = 0; actualNumberOfResourcesToMoveIntoTest > i; i++) {
        this._testOnBorrow()
      }
      // console.log('dispense - leaving test-on-borrow branch')
    }

    // Do we still have outstanding requests that can't be fulfilled by resources in-test and available
    const potentiallyAllocableResources = this._availableObjects.length +
      this._testOnBorrowResources.size +
      this._testOnReturnResources.size +
      this._factoryCreateOperations.size

    const resourceShortfall = waitingClients - potentiallyAllocableResources

    if (resourceShortfall > 0) {
      // console.log('dispense - entering resource shortfall branch')
      const spareResourceCapacity = this._config.max - (this._allObjects.size + this._factoryCreateOperations.size)

      if (spareResourceCapacity < 1) {
        // console.log('not enough allocable resources to satisfy all waiting clients and at max capacity')
      }

      const actualNumberOfResourcesToCreate = Math.min(spareResourceCapacity, resourceShortfall)
      for (let i = 0; actualNumberOfResourcesToCreate > i; i++) {
        this._createResource()
      }
      // console.log('dispense - leaving resource shortfall branch')
    }

    // if we aren't testing-on-borrow then lets try to allocate what we can
    if (this._config.testOnBorrow === false) {
      // console.log('dispense - entering non test-on-borrow branch')
      const actualNumberOfResourcesToDispatch = Math.min(this._availableObjects.length, waitingClients)
      for (let i = 0; actualNumberOfResourcesToDispatch > i; i++) {
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
  _dispatchPooledResourceToNextWaitingClient (pooledResource) {
    const clientResourceRequest = this._waitingClients.dequeue()
    if (clientResourceRequest === null) {
      // While we were away either all the waiting clients timed out
      // or were somehow fulfilled. put our pooledResource back.
      pooledResource.idle()
      this._addPooledResourceToAvailableObjects(pooledResource)
      // TODO: do need to trigger anything before we leave?
      return false
    }
    pooledResource.allocate()
    clientResourceRequest.resolve(pooledResource.obj)
    return true
  }

  /**
   * @private
   */
  _createResource () {
    this._count += 1
    this._log('createResource() - creating obj - count=' + this._count + ' min=' + this._config.min + ' max=' + this._config.max, 'verbose')

    // An attempt to create a resource
    const factoryPromise = this._factory.create()
    this._factoryCreateOperations.add(factoryPromise)

    factoryPromise
    .then((resource) => {
      this._log('createResource() - created obj - count=' + this._count + ' min=' + this._config.min + ' max=' + this._config.max, 'verbose')
      this._factoryCreateOperations.delete(factoryPromise)
      this._handleNewResource(resource)
    })
    .catch((err) => {
      this._factoryCreateOperations.delete(factoryPromise)
      this._count -= 1
      if (this._count < 0) { this._count = 0 }
      // FIXME: This should be emitted or at least exposed to userland
      // As a quick hack we'll at least log an error.
      this._log('error creating a resource: ' + err.message, 'error')
      this._dispense()
    })
  }

  _handleNewResource (resource) {
    const pooledResource = new PooledResource(resource)
    this._allObjects.addPooledResource(pooledResource)
    const resourceRequest = this._waitingClients.dequeue()
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
  _ensureMinimum () {
    if (this._draining === true) {
      return
    }
    if (this._count < this._config.min) {
      const diff = this._config.min - this._count
      for (let i = 0; i < diff; i++) {
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
   * @returns {Promise} `true` if the pool is not fully utilized, `false` otherwise.
   */
  acquire (priority) {
    // should this become a Promise.reject ?
    if (this._draining) {
      throw new Error('pool is draining and cannot accept work')
    }

    // TODO: should we defer this check till after this event loop incase "the situation" changes in the meantime
    if (this._config.maxWaitingClients !== undefined && this._waitingClients.size() >= this._config.maxWaitingClients) {
      return Promise.reject(new Error('max waitingClients count exceeded'))
    }

    const executor = (resolve, reject) => {
      const request = new ResourceRequest(resolve, reject, this._config.acquireTimeoutMillis)
      this._waitingClients.enqueue(request, priority)
      // FIXME: should this live outside the executor or does it not matter at all?
      this._dispense()
    }

    return new Promise(executor)
  }

  /**
   * Return the resource to the pool when it is no longer required.
   *
   * @param {Object} obj
   *   The acquired object to be put back to the pool.
   */
  release (resource) {
    // check to see if this object exists in the global list of resources
    // if it's not here then it's not a resource we know about
    const pooledResource = this._allObjects.getByResource(resource)

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
    this._dispense()
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
  destroy (resource) {
    const pooledResource = this._allObjects.getByResource(resource)

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
  _addPooledResourceToAvailableObjects (pooledResource) {
    if (this._config.returnToHead) {
      this._availableObjects.splice(0, 0, pooledResource)
    } else {
      this._availableObjects.push(pooledResource)
    }
  }

  /**
   * Disallow any new requests and let the request backlog dissapate.
   *
   * @returns {Promise}
   */
  drain () {
    const executor = (resolve, reject) => {
      this._log('draining', 'info')

      // disable the ability to put more work on the queue.
      this._draining = true

      // TODO: rather than check on timeout, can we move (some of) this check to
      // somewhere around/after pool.destroy / pool.release methods?
      // TODO: if we tracked all async operations/promises we could wait for them all to resolve!
      const check = () => {
        if (this._waitingClients.size() > 0) {
          // wait until all resource requests have been satisfied.
          setTimeout(check, 100) // FIXME: magic number 100?
        } else if (this._availableObjects.length !== this._count) {
          // wait until all objects have been released.
          setTimeout(check, 100) // FIXME: magic number 100?
        } else {
          resolve()
        }
      }
      check()
    }
    return new Promise(executor)
  }

  /**
   * Forcibly destroys all available resources regardless of timeout.  Intended to be
   * invoked as part of a drain.  Does not prevent the creation of new
   * resources as a result of subsequent calls to acquire.
   *
   * Note that if factory.min > 0, the pool will destroy all idle resources
   * in the pool, but replace them with newly created resources up to the
   * specified factory.min value.  If this is not desired, set factory.min
   * to zero before calling destroyAllNow()
   *
   */
  destroyAllNow () {
    this._log('force destroying all objects', 'info')
    this._removeIdleScheduled = false
    clearTimeout(this._removeIdleTimer)
    this._availableObjects.forEach(this._destroy, this)
    return Promise.all(this._factoryDestroyOperations)
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
  pooled (decorated, priority) {
    const self = this
    return function () {
      const callerArgs = arguments
      const callerCallback = callerArgs[callerArgs.length - 1]
      const callerHasCallback = typeof callerCallback === 'function'

      self.acquire(priority)
      .then(_onAcquire)
      .catch(function (err) {
        if (callerHasCallback) {
          callerCallback(err)
        }
      })

      function _onAcquire (resource) {
        function _wrappedCallback () {
          self.release(resource)
          if (callerHasCallback) {
            callerCallback.apply(null, arguments)
          }
        }

        const args = [resource].concat(Array.prototype.slice.call(callerArgs, 0, callerHasCallback ? -1 : undefined))
        args.push(_wrappedCallback)

        decorated.apply(null, args)
      }
    }
  }

  getPoolSize () {
    return this._count
  }

  getName () {
    return this._config.name
  }

  availableObjectsCount () {
    return this._availableObjects.length
  }

  // NOTE: the returned value currently includes items in test
  inUseObjectsCount () {
    return this._allObjects.size - this._availableObjects.length
  }

  waitingClientsCount () {
    return this._waitingClients.size()
  }

  getMaxPoolSize () {
    return this._config.max
  }

  getMinPoolSize () {
    return this._config.min
  }
}

module.exports = Pool
