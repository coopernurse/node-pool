
exports.Pool = function(factory) {
    var self = {};

    var idleTimeoutMillis = factory.idleTimeoutMillis || 30000;
    var reapInterval      = factory.reapIntervalMillis || 1000;

    var availableObjects = [];
    var objectTimeout    = {};
    var waitingClients   = [];
    var obj;
    var count = 0;
    var removeIdleScheduled = false;

    function log(str) {
        if (factory.log) {
            console.log("pool " + factory.name + " - " + str);
        }
    }

    function removeIdle() {
        removeIdleScheduled = false;

        var toKeep = [];
        var now = new Date().getTime();
        for (var i = 0; i < availableObjects.length; i++) {
            var timeout = objectTimeout[availableObjects[i]];
            if (now < timeout) {
                toKeep.push(availableObjects[i]);
            }
            else {
                log("removeIdle() destroying obj - now:" + now + " timeout:" + timeout);
                self.destroy(availableObjects[i]);
            }
        }

        availableObjects = toKeep;

        if (availableObjects.length > 0) {
            log("availableObjects.length=" + availableObjects.length);
            scheduleRemoveIdle();
        }
        else {
            log("removeIdle() all objects removed");
        }
    }

    function scheduleRemoveIdle() {
        if (!removeIdleScheduled) {
            removeIdleScheduled = true;
            setTimeout(removeIdle, reapInterval);
        }
    }

    function dispense() {
        log("dispense() clients=" + waitingClients.length + " available=" + availableObjects.length);
        if (waitingClients.length > 0) {
            obj = null;
            if (availableObjects.length > 0) {
                log("dispense() - reusing obj");
                obj = availableObjects.shift();
                delete objectTimeout[obj];
                waitingClients.shift()(obj);
            }
            else if (count < factory.max) {
                count++;
                log("dispense() - creating obj - count="+count);
                factory.create(function(obj) {
                    if (waitingClients.length > 0) {
                        waitingClients.shift()(obj);
                    }
                    else {
                        self.returnToPool(obj);
                    }
                });
            }
        }
    }

    self.borrow = function(callback) {
        waitingClients.push(callback);
        dispense();
    };

    self.destroy = function(obj) {
        count--;
        factory.destroy(obj);
    };

    self.returnToPool = function(obj) {
        //log("return to pool");
        availableObjects.push(obj);
        objectTimeout[obj] = (new Date().getTime() + idleTimeoutMillis);
        log("timeout: " + objectTimeout[obj]);
        dispense();
        scheduleRemoveIdle();
    };

    return self;
};
