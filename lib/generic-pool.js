
var PriorityQueue = function(size) {
    var me = {}, slots, i;
    
    // initialize arrays to hold queue elements
    size = parseInt(size, 10);
    size = (size > 0) ? size : 1;
    slots = [];
    for (i = 0; i < size; i++) {
        slots.push([]);
    }
    
    //  Public methods
    me.size = function() {
        var total = 0;
        for (var i = 0; i < size; i++) {
            total += slots[i].length;
        }
        return total;
    };
    
    me.enqueue = function(obj, priority) {
        if (priority) {
            var priorityOrig = priority;
            priority = parseInt(priority, 10);
            if (priority < 0 || priority >= size) {
                // put obj at the end of the line
                console.log("invalid priority: " + priorityOrig + " must be between 0 and " + (size-1));
                priority = (size - 1);
            }
        }
        else {
            priority = 0;    
        }
        
        slots[priority].push(obj);
    };
    
    me.dequeue = function(callback) {
        var obj = null;
        for (var i = 0; i < slots.length; i++) {
            if (slots[i].length > 0) {
                obj = slots[i].shift();
                break;
            }
        }
        return obj;
    };
    
    return me;
};

exports.Pool = function(factory) {
    var me = {};

    var idleTimeoutMillis = factory.idleTimeoutMillis || 30000;
    var reapInterval      = factory.reapIntervalMillis || 1000;

    var availableObjects = [];
    var objectTimeout    = {};
    var waitingClients   = new PriorityQueue(factory.priorityRange || 1);
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
                me.destroy(availableObjects[i]);
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
        var waitingCount = waitingClients.size();
        log("dispense() clients=" + waitingCount + " available=" + availableObjects.length);
        
        if (waitingCount > 0) {
            obj = null;
            if (availableObjects.length > 0) {
                log("dispense() - reusing obj");
                obj = availableObjects.shift();
                delete objectTimeout[obj];
                waitingClients.dequeue()(obj);
            }
            else if (count < factory.max) {
                count++;
                log("dispense() - creating obj - count="+count);
                factory.create(function(obj) {
                    var cb = waitingClients.dequeue();
                    if (cb) {
                        cb(obj);
                    }
                    else {
                        me.returnToPool(obj);
                    }
                });
            }
        }
    }

    me.borrow = function(callback, priority) {
        waitingClients.enqueue(callback, priority);
        dispense();
    };

    me.destroy = function(obj) {
        count--;
        factory.destroy(obj);
    };

    me.returnToPool = function(obj) {
        //log("return to pool");
        availableObjects.push(obj);
        objectTimeout[obj] = (new Date().getTime() + idleTimeoutMillis);
        log("timeout: " + objectTimeout[obj]);
        dispense();
        scheduleRemoveIdle();
    };

    return me;
};
