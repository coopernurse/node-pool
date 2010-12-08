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
 *
 * @returns {Object} An Object pool that works with the supplied `factory`.
 */
exports.Pool = function (factory) {
  var self = {},

      idleTimeoutMillis = factory.idleTimeoutMillis || 30000,
      reapInterval = factory.reapIntervalMillis || 1000,

      availableObjects = [],
      objectTimeout = {},
      waitingClients = [],
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
    var obj = null;
    log("dispense() clients=" + waitingClients.length + " available=" + availableObjects.length);
    if (waitingClients.length > 0) {
      if (availableObjects.length > 0) {
        log("dispense() - reusing obj");
        obj = availableObjects.shift();
        delete objectTimeout[obj];
        waitingClients.shift()(obj);
      }
      else if (count < factory.max) {
        count += 1;
        log("dispense() - creating obj - count=" + count);
        factory.create(function (obj) {
          if (waitingClients.length > 0) {
            waitingClients.shift()(obj);
          } else {
            self.returnToPool(obj);
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
   *   Callback function to be called after the acquire is successfull.
   *   The function will recieve the acquired item as the first parameter.
   */
  self.borrow = self.acquire = function (callback) {
    waitingClients.push(callback);
    dispense();
  };

  /**
   * Return the client to the pool, in case it is no longer required.
   *
   * @param {Object} obj
   *   The acquired object to be put back to the pool.
   */
  self.returnToPool = self.release = function (obj) {
    //log("return to pool");
    availableObjects.push(obj);
    objectTimeout[obj] = (new Date().getTime() + idleTimeoutMillis);
    log("timeout: " + objectTimeout[obj]);
    dispense();
    scheduleRemoveIdle();
  };

  return self;
};