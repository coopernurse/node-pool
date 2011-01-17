var poolModule = require('generic-pool');

module.exports = {
    
    'expands to max limit' : function (assert, beforeExit) {
        var createCount  = 0;
        var destroyCount = 0;
        var borrowCount  = 0;
    
        var pool = poolModule.Pool({
            name     : 'test1',
            create   : function(callback) {
                createCount++;
                callback(createCount);
            },
            destroy  : function(client) { destroyCount++; },
            max : 2,
            idleTimeoutMillis : 100
        });
    
        for (var i = 0; i < 10; i++) {
            pool.acquire(function(obj) {
                return function() {
                    setTimeout(function() {
                        borrowCount++;
                        pool.release(obj);
                    }, 100);
                };
            }());
        }
    
        beforeExit(function() {
            assert.equal(2, createCount);
            assert.equal(2, destroyCount);
            assert.equal(10, borrowCount);
        });
    },
    
    'supports priority on borrow' : function(assert, beforeExit) {
        var borrowTimeLow  = 0;
        var borrowTimeHigh = 0;
        var borrowCount = 0;
        var i;
        
        var pool = poolModule.Pool({
            name     : 'test2',
            create   : function(callback) { callback(); },
            destroy  : function(client) { },
            max : 1,
            idleTimeoutMillis : 100,
            priorityRange : 2
        });
        
        for (i = 0; i < 10; i++) {
            pool.acquire(function(obj) {
                return function() {
                    setTimeout(function() {
                        var t = new Date().getTime();
                        if (t > borrowTimeLow) { borrowTimeLow = t; }
                        borrowCount++;
                        pool.release(obj);
                    }, 50);
                };
            }(), 1);
        }
        
        for (i = 0; i < 10; i++) {
            pool.acquire(function(obj) {
                return function() {
                    setTimeout(function() {
                        var t = new Date().getTime();
                        if (t > borrowTimeHigh) { borrowTimeHigh = t; }
                        borrowCount++;
                        pool.release(obj);
                    }, 50);
                };
            }(), 0);
        }
        
        beforeExit(function() {
            assert.equal(20, borrowCount);
            assert.equal(true, borrowTimeLow > borrowTimeHigh);
        });
    },
    
    'removes correct object on reap' : function (assert, beforeExit) {
        var destroyed = [];
        var clientCount = 0;
        
        var pool = poolModule.Pool({
            name     : 'test3',
            create   : function(callback) { callback({ id : ++clientCount }); },
            destroy  : function(client) { destroyed.push(client.id); },
            max : 2,
            idleTimeoutMillis : 100
        });
        
        pool.acquire(function(client) { 
            // should be removed second
            setTimeout(function() { pool.release(client); }, 5);
        });
        pool.acquire(function(client) {
            // should be removed first
            pool.release(client);
        });
        
        setTimeout(function() { }, 102);
        
        beforeExit(function() {
            assert.equal(2, destroyed[0]);
            assert.equal(1, destroyed[1]);
        });
    }
    
};