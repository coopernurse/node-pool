'use strict'

const EventEmitter = require('events').EventEmitter

const factoryValidator = require('./factoryValidator')
const PoolOptions = require('./PoolOptions')
const ResourceRequest = require('./ResourceRequest')
const ResourceLoan = require('./ResourceLoan')
const PooledResource = require('./PooledResource')

const reflector = require('./utils').reflector

/**
 * TODO: move me
 */
const FACTORY_CREATE_ERROR = 'factoryCreateError'
const FACTORY_DESTROY_ERROR = 'factoryDestroyError'

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
   */
  constructor (Evictor, Deque, PriorityQueue, factory, options) {
    super()

    factoryValidator(factory)

    this._config = new PoolOptions(options)

    // TODO: fix up this ugly glue-ing
    this._Promise = this._config.Promise

    this._factory = factory
    this._draining = false
    this._started = false
    /**
     * Holds waiting clients
     * @type {PriorityQueue}
     */
    this._waitingClientsQueue = new PriorityQueue(this._config.priorityRange)

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
    this._availableObjects = new Deque()

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
    this._allObjects = new Set()

    /**
     * Loans keyed by the borrowed resource
     * @type {Map}
     */
    this._resourceLoans = new Map()

    /**
     * Infinitely looping iterator over available object
     * @type {DLLArrayIterator}
     */
    this._evictionIterator = this._availableObjects.iterator()

    this._evictor = new Evictor()

    /**
     * handle for setTimeout for next eviction run
     * @type {[type]}
     */
    this._scheduledEviction = null

    // create initial resources (if factory.min > 0)
    if (this._config.autostart === true) {
      this.start()
    }
  }

  _destroy (pooledResource) {
    // FIXME: do we need another state for "in destruction"?
    pooledResource.invalidate()
    this._allObjects.delete(pooledResource)
    // NOTE: this maybe very bad promise usage?
    const destroyPromise = this._factory.destroy(pooledResource.obj)
    const wrappedDestroyPromise = this._Promise.resolve(destroyPromise)

    this._trackOperation(wrappedDestroyPromise, this._factoryDestroyOperations)
    .catch((reason) => {
      this.emit(FACTORY_DESTROY_ERROR, reason)
    })

    // TODO: maybe ensuring minimum pool size should live outside here
    this._ensureMinimum()
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
    const validationPromise = this._factory.validate(pooledResource.obj)
    const wrappedValidationPromise = this._Promise.resolve(validationPromise)

    this._trackOperation(wrappedValidationPromise, this._validationOperations)
    .then((isValid) => {
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
   * the pool, or creating new ones
   *
   * @private
   */
  _dispense () {
    /**
     * Local variables for ease of reading/writing
     * these don't (shouldn't) change across the execution of this fn
     */
    const numWaitingClients = this._waitingClientsQueue.length

    // If there aren't any waiting requests then there is nothing to do
    // so lets short-circuit
    if (numWaitingClients < 1) {
      return
    }

    const resourceShortfall = numWaitingClients - this._potentiallyAllocableResourceCount

    const actualNumberOfResourcesToCreate = Math.min(this.spareResourceCapacity, resourceShortfall)
    for (let i = 0; actualNumberOfResourcesToCreate > i; i++) {
      this._createResource()
    }

    // If we are doing test-on-borrow see how many more resources need to be moved into test
    // to help satisfy waitingClients
    if (this._config.testOnBorrow === true) {
      // how many available resources do we need to shift into test
      const desiredNumberOfResourcesToMoveIntoTest = numWaitingClients - this._testOnBorrowResources.size
      const actualNumberOfResourcesToMoveIntoTest = Math.min(this._availableObjects.length, desiredNumberOfResourcesToMoveIntoTest)
      for (let i = 0; actualNumberOfResourcesToMoveIntoTest > i; i++) {
        this._testOnBorrow()
      }
    }

    // if we aren't testing-on-borrow then lets try to allocate what we can
    if (this._config.testOnBorrow === false) {
      const actualNumberOfResourcesToDispatch = Math.min(this._availableObjects.length, numWaitingClients)
      for (let i = 0; actualNumberOfResourcesToDispatch > i; i++) {
        this._dispatchResource()
      }
    }
  }

  /**
   * Dispatches a pooledResource to the next waiting client (if any) else
   * puts the PooledResource back on the available list
   * @param  {[type]} pooledResource [description]
   * @return {[type]}                [description]
   */
  _dispatchPooledResourceToNextWaitingClient (pooledResource) {
    const clientResourceRequest = this._waitingClientsQueue.dequeue()
    if (clientResourceRequest === undefined) {
      // While we were away either all the waiting clients timed out
      // or were somehow fulfilled. put our pooledResource back.
      this._addPooledResourceToAvailableObjects(pooledResource)
      // TODO: do need to trigger anything before we leave?
      return false
    }
    const loan = new ResourceLoan(pooledResource, this._Promise)
    this._resourceLoans.set(pooledResource.obj, loan)
    pooledResource.allocate()
    clientResourceRequest.resolve(pooledResource.obj)
    return true
  }

  /**
   * tracks on operation using given set
   * handles adding/removing from the set and resolve/rejects the value/reason
   * @param  {Promise} operation
   * @param  {Set} set       Set holding operations
   * @return {Promise}       Promise that resolves once operation has been removed from set
   */
  _trackOperation (operation, set) {
    set.add(operation)

    return operation.then((v) => {
      set.delete(operation)
      return this._Promise.resolve(v)
    }, (e) => {
      set.delete(operation)
      return this._Promise.reject(e)
    })
  }

  /**
   * @private
   */
  _createResource () {
    // An attempt to create a resource
    const factoryPromise = this._factory.create()
    const wrappedFactoryPromise = this._Promise.resolve(factoryPromise)

    this._trackOperation(wrappedFactoryPromise, this._factoryCreateOperations)
    .then((resource) => {
      this._handleNewResource(resource)
    })
    .catch((reason) => {
      this.emit(FACTORY_CREATE_ERROR, reason)
      this._dispense()
    })
  }

  _handleNewResource (resource) {
    const pooledResource = new PooledResource(resource)
    this._allObjects.add(pooledResource)
    // TODO: check we aren't exceding our maxPoolSize before doing
    this._dispatchPooledResourceToNextWaitingClient(pooledResource)
  }

  /**
   * @private
   */
  _ensureMinimum () {
    if (this._draining === true) {
      return
    }
    const minShortfall = this._config.min - this._count
    for (let i = 0; i < minShortfall; i++) {
      this._createResource()
    }
  }

  _evict () {
    const testsToRun = Math.min(this._config.numTestsPerEvictionRun, this._availableObjects.length)
    const evictionConfig = {
      softIdleTimeoutMillis: this._config.softIdleTimeoutMillis,
      idleTimeoutMillis: this._config.idleTimeoutMillis,
      min: this._config.min
    }
    for (let testsHaveRun = 0; testsHaveRun < testsToRun;) {
      const iterationResult = this._evictionIterator.next()

      // Safety check incase we could get stuck in infinite loop because we
      // somehow emptied the array after chekcing it's length
      if (iterationResult.done === true && this._availableObjects.length < 1) {
        this._evictionIterator.reset()
        return
      }
      // if this happens it should just mean we reached the end of the
      // list and can reset the cursor.
      if (iterationResult.done === true && this._availableObjects.length > 0) {
        this._evictionIterator.reset()
        break
      }

      const resource = iterationResult.value

      const shouldEvict = this._evictor.evict(evictionConfig, resource, this._availableObjects.length)
      testsHaveRun++

      if (shouldEvict === true) {
        // take it out of the _availableObjects list
        this._evictionIterator.remove()
        this._destroy(resource)
      }
    }
  }

  _scheduleEvictorRun () {
    // Start eviction if set
    if (this._config.evictionRunIntervalMillis > 0) {
      this._scheduledEviction = setTimeout(() => {
        this._evict()
        this._scheduleEvictorRun()
      }, this._config.evictionRunIntervalMillis)
    }
  }

  _descheduleEvictorRun () {
    clearTimeout(this._scheduledEviction)
    this._scheduledEviction = null
  }

  start () {
    if (this._draining === true) {
      return
    }
    if (this._started === true) {
      return
    }
    this._started = true
    this._scheduleEvictorRun()
    this._ensureMinimum()
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
   * @returns {Promise}
   */
  acquire (priority) {
    if (this._draining) {
      return this._Promise.reject(new Error('pool is draining and cannot accept work'))
    }

    // TODO: should we defer this check till after this event loop incase "the situation" changes in the meantime
    if (this._config.maxWaitingClients !== undefined && this._waitingClientsQueue.length >= this._config.maxWaitingClients) {
      return this._Promise.reject(new Error('max waitingClients count exceeded'))
    }

    const resourceRequest = new ResourceRequest(this._config.acquireTimeoutMillis, this._Promise)
    this._waitingClientsQueue.enqueue(resourceRequest, priority)
    this._dispense()

    return resourceRequest.promise
  }

  /**
   * Return the resource to the pool when it is no longer required.
   *
   * @param {Object} obj
   *   The acquired object to be put back to the pool.
   */
  release (resource) {
    // check for an outstanding loan
    const loan = this._resourceLoans.get(resource)

    if (loan === undefined) {
      return this._Promise.reject(new Error('Resource not currently part of this pool'))
    }

    this._resourceLoans.delete(resource)
    loan.resolve()
    const pooledResource = loan.pooledResource

    pooledResource.deallocate()
    this._addPooledResourceToAvailableObjects(pooledResource)

    this._dispense()
    return this._Promise.resolve()
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
    // check for an outstanding loan
    const loan = this._resourceLoans.get(resource)

    if (loan === undefined) {
      return this._Promise.reject(new Error('Resource not currently part of this pool'))
    }

    this._resourceLoans.delete(resource)
    loan.resolve()
    const pooledResource = loan.pooledResource

    pooledResource.deallocate()
    this._destroy(pooledResource)

    this._dispense()
    return this._Promise.resolve()
  }

  _addPooledResourceToAvailableObjects (pooledResource) {
    pooledResource.idle()
    if (this._config.fifo === true) {
      this._availableObjects.push(pooledResource)
    } else {
      this._availableObjects.unshift(pooledResource)
    }
  }

  /**
   * Disallow any new acquire calls and let the request backlog dissapate.
   * The Pool will no longer attempt to maintain a "min" number of resources
   * and will only make new resources on demand.
   * Resolves once all resource requests are fulfilled and all resources are returned to pool and available...
   * Should probably be called "drain work"
   * @returns {Promise}
   */
  drain () {
    this._draining = true
    return this.__allResourceRequestsSettled()
      .then(() => {
        return this.__allResourcesReturned()
      })
      .then(() => {
        this._descheduleEvictorRun()
      })
  }

  __allResourceRequestsSettled () {
    if (this._waitingClientsQueue.length > 0) {
      // wait for last waiting client to be settled
      // FIXME: what if they can "resolve" out of order....?
      return reflector(this._waitingClientsQueue.tail.promise)
    }
    return this._Promise.resolve()
  }

  // FIXME: this is a horrific mess
  __allResourcesReturned () {
    const ps = Array.from(this._resourceLoans.values())
    .map((loan) => loan.promise)
    .map(reflector)
    return this._Promise.all(ps)
  }

  /**
   * Forcibly destroys all available resources regardless of timeout.  Intended to be
   * invoked as part of a drain.  Does not prevent the creation of new
   * resources as a result of subsequent calls to acquire.
   *
   * Note that if factory.min > 0 and the pool isn't "draining", the pool will destroy all idle resources
   * in the pool, but replace them with newly created resources up to the
   * specified factory.min value.  If this is not desired, set factory.min
   * to zero before calling clear()
   *
   */
  clear () {
    const reflectedCreatePromises = Array.from(this._factoryCreateOperations)
    .map(reflector)

    // wait for outstanding factory.create to complete
    return this._Promise.all(reflectedCreatePromises)
    .then(() => {
      // Destroy existing resources
      for (const resource of this._availableObjects) {
        this._destroy(resource)
      }
      const reflectedDestroyPromises = Array.from(this._factoryDestroyOperations)
      .map(reflector)
      return this._Promise.all(reflectedDestroyPromises)
    })
  }

  /**
   * How many resources are available to allocated
   * (includes resources that have not been tested and may faul validation)
   * NOTE: internal for now as the name is awful and might not be useful to anyone
   * @return {Number} number of resources the pool has to allocate
   */
  get _potentiallyAllocableResourceCount () {
    return this._availableObjects.length +
      this._testOnBorrowResources.size +
      this._testOnReturnResources.size +
      this._factoryCreateOperations.size
  }

  /**
   * The combined count of the currently created objects and those in the
   * process of being created
   * Does NOT include resources in the process of being destroyed
   * sort of legacy...
   * @return {Number}
   */
  get _count () {
    return this._allObjects.size + this._factoryCreateOperations.size
  }

  /**
   * How many more resources does the pool have room for
   * @return {Number} number of resources the pool could create before hitting any limits
   */
  get spareResourceCapacity () {
    return this._config.max - (this._allObjects.size + this._factoryCreateOperations.size)
  }

  /**
   * see _count above
   * @return {Number} [description]
   */
  get size () {
    return this._count
  }

  /**
   * number of available resources
   * @return {Number} [description]
   */
  get available () {
    return this._availableObjects.length
  }

  /**
   * number of resources that are currently acquired
   * @return {[type]} [description]
   */
  get borrowed () {
    return this._resourceLoans.size
  }

  /**
   * number of waiting acquire calls
   * @return {[type]} [description]
   */
  get pending () {
    return this._waitingClientsQueue.length
  }

  /**
   * maximum size of the pool
   * @return {[type]} [description]
   */
  get max () {
    return this._config.max
  }

  /**
   * minimum size of the pool
   * @return {[type]} [description]
   */
  get min () {
    return this._config.min
  }
}

module.exports = Pool
