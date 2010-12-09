var PriorityQueue = function(size) {
  var me = {}, slots, i, total = null;

  // initialize arrays to hold queue elements
  size = Math.max(+size | 0, 1);
  slots = [];
  for (i = 0; i < size; i += 1) {
    slots.push([]);
  }

  //  Public methods
  me.size = function () {
    var i;
    if (total === null) {
      total = 0;
      for (i = 0; i < size; i += 1) {
        total += slots[i].length;
      }
    }
    return total;
  };

  me.enqueue = function (obj, priority) {
    var priorityOrig;

    // Convert to integer with a default value of 0.
    priority = priority && + priority | 0 || 0;

    // Clear cache for total.
    total = null;
    if (priority) {
      priorityOrig = priority;
      if (priority < 0 || priority >= size) {
        priority = (size - 1);
        // put obj at the end of the line
        console.error("invalid priority: " + priorityOrig + " must be between 0 and " + priority);
      }
    }

    slots[priority].push(obj);
  };

  me.dequeue = function (callback) {
    var obj = null, i, sl = slots.length;

    // Clear cache for total.
    total = null;
    for (i = 0; i < sl; i += 1) {
      if (slots[i].length) {
        obj = slots[i].shift();
        break;
      }
    }
    return obj;
  };

  return me;
};

/**
 * Generate an Object pool with a specified `factory`.
 *
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
 * @param {Number} factory.max
 *   Maximum numnber of items that can exist at the same time.
 *   Any further acquire requests will be pushed to the waiting list.
 * @param {Number} factory.idleTimeoutMillis
 *   Delay in milliseconds after the idle items in the pool will be destroyed.
 *   And idle item is that is not acquired yet. Waiting items doesn't count here.
 * @param {Number} factory.reapIntervalMillis
 *   Cleanup is scheduled in every `factory.reapIntervalMillis` milliseconds.
 * @param {Boolean|Function} factory.log
 *   Whether the pool should log activity. If function is specified,
 *   that will be used instead.
 * @param {Number} factory.priorityRange
 *   The range from 1 to be treated as a valid priority
 *
 * @returns {Object} An Object pool that works with the supplied `factory`.
 */
exports.Pool = function (factory) {
  var me = {},

      idleTimeoutMillis = factory.idleTimeoutMillis || 30000,
      reapInterval = factory.reapIntervalMillis || 1000,

      availableObjects = [],
      objectTimeout = {},
      waitingClients = new PriorityQueue(factory.priorityRange || 1),
      count = 0,
      removeIdleScheduled = false,

      // Prepare a logger function.
      log = factory.log ?
        (typeof factory.log === 'function' ?
          factory.log :
          function (str) {
            console.log("pool " + factory.name + " - " + str);
          }
        ) :
        function () {};

  factory.max = Math.max(factory.max, 1);

  /**
   * Request the client to be destroyed. The factory's destroy handler
   * will also be called.
   *
   * @param {Object} obj
   *   The acquired item to be destoyed.
   */
  function destroy(obj) {
    count -= 1;
    factory.destroy(obj);
  }

  /**
   * Checks and removes the available (idle) clients that has timed out.
   */
  function removeIdle() {
    var toKeep = [],
        now = new Date().getTime(),
        i,
        al,
        timeout;

    removeIdleScheduled = false;

    // Go through the available (idle) items,
    // check if they have timed out
    for (i = 0, al = availableObjects.length; i < al; i += 1) {
      timeout = objectTimeout[availableObjects[i]];
      if (now < timeout) {
        // Client hasn't timed out, so keep it.
        toKeep.push(availableObjects[i]);
      } else {
        // The client timed out, call it's destroyer.
        log("removeIdle() destroying obj - now:" + now + " timeout:" + timeout);
        destroy(availableObjects[i]);
      }
    }

    // Replace the available items with the ones to keep.
    availableObjects = toKeep;
    al = availableObjects.length;

    if (al > 0) {
      log("availableObjects.length=" + al);
      scheduleRemoveIdle();
    } else {
      log("removeIdle() all objects removed");
    }
  }


  /**
   * Schedule removal of idle items in the pool.
   *
   * More schedules cannot run concurrently.
   */
  function scheduleRemoveIdle() {
    if (!removeIdleScheduled) {
      removeIdleScheduled = true;
      setTimeout(removeIdle, reapInterval);
    }
  }

  /**
   * Try to get a new client to work, and clean up pool unused (idle) items.
   *
   *  - If there are available clients waiting shift the first one out (LIFO),
   *    and call it's callback.
   *  - If there are no waiting clients, try to create one if it wont exciede
   *    the maximum number of clients.
   *  - If creating a new client would exciede the maximum, add the client to
   *    the wait list.
   */
  function dispense() {
    var obj = null,
        waitingCount = waitingClients.size();
    log("dispense() clients=" + waitingCount + " available=" + availableObjects.length);
    if (waitingCount > 0) {
      if (availableObjects.length > 0) {
        log("dispense() - reusing obj");
        obj = availableObjects.shift();
        delete objectTimeout[obj];
        waitingClients.dequeue()(obj);
      }
      else if (count < factory.max) {
        count += 1;
        log("dispense() - creating obj - count=" + count);
        factory.create(function (obj) {
          var cb = waitingClients.dequeue();
          if (cb) {
            cb(obj);
          } else {
            me.release(obj);
          }
        });
      }
    }
  }

  /**
   * Request a new client. The callback will be called,
   * when a new client will be availabe, passing the client to it.
   *
   * @param {Function} callback
   *   Callback function to be called after the acquire is successful.
   *   The function will recieve the acquired item as the first parameter.
   *
   * @param {Number} priority
   *   Optional.  Integer between 0 and (priorityRange - 1).  Specifies the priority
   *   of the caller if there are no available resources.  Lower numbers mean higher
   *   priority.
   */
  me.acquire = function (callback, priority) {
    waitingClients.enqueue(callback, priority);
    dispense();
  };
  
  me.borrow = function (callback, priority) {
    log("borrow() is deprecated. use acquire() instead");
    me.acquire(callback, priority);
  };

  /**
   * Return the client to the pool, in case it is no longer required.
   *
   * @param {Object} obj
   *   The acquired object to be put back to the pool.
   */
  me.release = function (obj) {
    //log("return to pool");
    availableObjects.push(obj);
    objectTimeout[obj] = (new Date().getTime() + idleTimeoutMillis);
    log("timeout: " + objectTimeout[obj]);
    dispense();
    scheduleRemoveIdle();
  };
  
  me.returnToPool = function (obj) {
    log("returnToPool() is deprecated. use release() instead");
    me.release(obj);
  };

  return me;
};