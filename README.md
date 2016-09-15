[![build status](https://secure.travis-ci.org/coopernurse/node-pool.png)](http://travis-ci.org/coopernurse/node-pool)

# Generic Pool

## About

  Generic resource pool.  Can be used to reuse or throttle expensive resources such as
  database connections.

  This module should work on any version of node from at least 0.6+, however the test and linting tools used only run on node >=10 so official support is for node 10 and up. All that said, if you find a bug on the older versions and can give us a test case we'll try to fix it.

**Future Versions Warning**

Generic Pool v3 will most likely be the last version to support any versions of nodejs prior to v4. It is planned for Generic Pool v4 to only support nodejs v4 and above (this may change however!)

## History

The history has been moved to the [CHANGELOG](CHANGELOG.md)


## Installation

```sh
$ npm install generic-pool [--save]
```


## Example

Here is an example using a fictional generic database driver that doesn't implement any pooling whatsoever itself.

```js
var Pool = require('generic-pool').Pool;
var DbDriver = require('some-db-driver');

/**
 * Step 1 - Create pool using a factory object
 */
const factory = {
    create: function(){
		 return new Promise(function(resolve, reject{
	        var client = DbDriver.createClient()
	        client.on('connected', function(){
	            resolve(client)
	        })
	    })
    }
    destroy: function(client){
        return new Promise(function(resolve){
          client.on('end', function(){
            resolve()
          })
          client.disconnect()
        })
    }
}

var opts = {
    max: 10, // maximum size of the pool
    min: 2 // minimum size of the pool
}

var myPool = new Pool(factory, opts)

/**
 * Step 2 - Use pool in your code to acquire/release resources
 */

// acquire connection - Promise is resolved
// once a resource becomes available
const resourcePromise = myPool.acquire()

resourcePromise.then(function(client) {
	client.query("select * from foo", [], function() {
	    // return object back to pool
	    pool.release(client);
	});
})
.catch(function(err){
   // handle error - this is generally a timeout or maxWaitingClients 
   // error
});

/**
 * Step 3 - Drain pool during shutdown (optional)
 */
// Only call this once in your application -- at the point you want
// to shutdown and stop using this pool.
pool.drain(function() {
    pool.clear();
});

```

## Draining (move me!)

If you are shutting down a long-lived process, you may notice
that node fails to exit for 30 seconds or so.  This is a side
effect of the idleTimeoutMillis behavior -- the pool has a
setTimeout() call registered that is in the event loop queue, so
node won't terminate until all resources have timed out, and the pool
stops trying to manage them.

This behavior will be more problematic when you set factory.min > 0,
as the pool will never become empty, and the setTimeout calls will
never end.

In these cases, use the pool.drain() function.  This sets the pool
into a "draining" state which will gracefully wait until all
idle resources have timed out.  For example, you can call:

If you do this, your node process will exit gracefully.


## Documentation

### Constructor

The `Pool` constructor takes two arguments:

- `factory` :  an object containing functions to create/destroy/test resources for the `Pool`
- `opts` : an optional object/dictonary to allow configuring/altering behaviour the of the `Pool`

```js
var pool = new Pool(factory, opts)
```

**factory**

Can be any object/instance but must have the following properties:

- `create` : a function that the pool will call when it wants a new resource. It should return a Promise that either resolves to a `resource` or rejects to an `Error` if it is unable to create a resourse for whatever.
- `destroy`: a function that the pool will call when it wants to destroy a resource. It should accept one argument `resource` where `resource` is whatever `factory.create` made. The `destroy` function should return a `Promise` that resolves once it has destroyed the resource.


optionally it can also have the following property:

- `validate`: a function that the pool will call if it wants to validate a resource. It should accept one argument `resource` where `resource` is whatever `factory.create` made. Should return a `Promise` that resolves a `boolean` where `true` indicates the resource is still valid or `false` if the resource is invalid. 


**opts**

An optional object/dictionary with the any of the following properties: 

- `name`: name of pool (string) (not really used for much)
- `max`: maximum number of resources to create at any given time. (default=1)
- `min`: minimum number of resources to keep in pool at any given time. If this is set >= max, the pool will silently set the min to equal `max`. (default=0)
- `maxWaitingClients`: maximum number of queued requests allowed, additional `acquire` calls will be callback with an `err` in a future cycle of the event loop.
- `testOnBorrow`: `boolean`: should the pool validate resources before giving them to clients. Requires that either `factory.validate` or `factory.validateAsync` to be specified.
- `refreshIdle`: `boolean` that specifies whether idle resources at or below the min threshold should be destroyed/re-created. (default=true)
- `idleTimeoutMillis`: max milliseconds a resource can stay unused in the pool without being borrowed before it should be destroyed (default 30000)
- `reapIntervalMillis`: interval to check for idle resources (default 1000). (remove me!)
- `acquireTimeoutMillis`: max milliseconds an `acquire` call will wait for a resource before timing out. (default no limit), if supplied should non-zero positive integer.
- `returnToHead` : if true the most recently released resources will be the first to be allocated. This in effect turns the pool's behaviour from a queue into a stack. `boolean`, (default false)
- `priorityRange`: int between 1 and x - if set, borrowers can specify their relative priority in the queue if no resources are available.
                         see example.  (default 1)
- `autostart`: boolean, should the pool start creating resources etc once the constructor is called, (default true) 
- `log` : true/false or function - If a log is a function, it will be called with two parameters:
	- log string
	- log level ('verbose', 'info', 'warn', 'error')
	
	Else if log is true, verbose log info will be sent to console.log().
	Else internal log messages be ignored (this is the default)

### pool.acquire

```js
const onfulfilled = function(resource){
	resource.doStuff()
	// release/destroy/etc
}

pool.acquire().then(onfulfilled)
//or
const priority = 2
pool.acquire(priority).then(onfulfilled)
```

This function is for when you want to "borrow" a resource from the pool.

`acquire` takes one optional argument:

- `priority`: optional, number, see **Priority Queueing** below.

and returns a `Promise`
Once a resource in the pool is available, the promise will be resolved with a `resource` (whatever `factory.create` makes for you). If the Pool is unable to give a resource (e.g timeout) then the promise will be rejected with an `Error`

### pool.release

```js
pool.release(resource)
```

This function is for when you want to return a resource to the pool.

`release` takes one required argument:

- `resource`: a previously borrowed resource

### pool.destroy

This function is for when you want to return a resource to the pool but want it destroyed rather than being made available to other resources. E.g you may know the resource has timed out or crashed.

`destroy` takes one required argument:

- `resource`: a previously borrow resource

### pool.on

The pool is an event emitter. Below are the events it emits and any args for those events

`factoryCreateError` : emitted when a promise returned by `factory.create` is rejected. If this event has no listeners then the `error` will be silently discarded

- `err`: whatever `reason` the promise was rejected with. 

## Priority Queueing

The pool supports optional priority queueing.  This becomes relevant when no resources are available and the caller has to wait. `acquire()` accepts an optional priority int which
specifies the caller's relative position in the queue. Each priority slot has it's own internal queue created for it. When a resource is available for borrowing, the first request in the highest priority queue will be given it.

Specifying a `priority` to `acquire` that is outside the `priorityRange` set at `Pool` creation time will result in the `priority` being converted the lowest possible `priority` 

```js
// create pool with priorityRange of 3
// borrowers can specify a priority 0 to 2
var opts = {
  priorityRange : 3
}
var pool = new Pool(someFactory,opts);

// acquire connection - no priority specified - will go onto lowest priority queue
pool.acquire().thenfunction(client) {
    pool.release(client);
});

// acquire connection - high priority - will go into highest priority queue
pool.acquire(0).then(function(client) {
    pool.release(client);
});

// acquire connection - medium priority - will go into 'mid' priority queue
pool.acquire(1).then(function(client) {
    pool.release(client);
});

// etc..
```

## Draining

If you know you would like to terminate all the available resources in your pool before any timeouts they might have, have been reached, you can use `clear()` in conjunction with `drain()`:

```js
const p = pool.drain()
.then(function() {
    return pool.clear();
});
```
The `promise` returned will resolve once all waiting clients have acquired and return resources, and any available resources have been destroyed

One side-effect of calling `drain()` is that subsequent calls to `acquire()`
will throw an Error.

## Pooled function decoration

To transparently handle object acquisition for a function,
one can use `pooled()`:

```js
var privateFn, publicFn;
publicFn = pool.pooled(privateFn = function(client, arg, cb) {
    // Do something with the client and arg. Client is auto-released when cb is called
    cb(null, arg);
});
```

Keeping both private and public versions of each function allows for pooled
functions to call other pooled functions with the same member. This is a handy
pattern for database transactions:

```js
var privateTop, privateBottom, publicTop, publicBottom;
publicBottom = pool.pooled(privateBottom = function(client, arg, cb) {
    //Use client, assumed auto-release
});

publicTop = pool.pooled(privateTop = function(client, cb) {
    // e.g., open a database transaction
    privateBottom(client, "arg", function(err, retVal) {
        if(err) { return cb(err); }
        // e.g., close a transaction
        cb();
    });
});
```

## Pool info

The following functions will let you get information about the pool:

```js
// returns factory.name for this pool
pool.getName()

// returns number of resources in the pool regardless of
// whether they are free or in use
pool.getPoolSize()

// returns number of unused resources in the pool
pool.availableObjectsCount()

// returns number of callers waiting to acquire a resource
pool.waitingClientsCount()

// returns number of maxixmum number of resources allowed by ppol
pool.getMaxPoolSize()

// returns number of minimum number of resources allowed by ppol
pool.getMinPoolSize()

```

## Run Tests

    $ npm install
    $ npm test

The tests are run/written using Tap. Most are ports from the old espresso tests and are not in great condition. Most cases are inside `test/generic-pool-test.js` with newer cases in their own files (legacy reasons).

## Linting

We use eslint and the `standard` ruleset.


## License

(The MIT License)

Copyright (c) 2010-2016 James Cooper &lt;james@bitmechanic.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
