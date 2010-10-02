
# About

  Generic resource pool.  Can be used to reuse or throttle expensive resources such as
  database connections.

## Installation

    $ npm install generic-pool

## Example

    // Create a MySQL connection pool with
    // a max of 10 connections and a 30 second max idle time
    var poolModule = require('pool');
    var pool = poolModule.Pool({
        name     : 'mysql',
        create   : function(callback) {
            var Client = require('mysql').Client;
            var c = new Client();
            c.user     = 'scott';
            c.password = 'tiger';
            c.database = 'mydb';
            c.connect();
            callback(c);
        },
        destroy  : function(client) { client.end(); },
        max : 10,
        idleTimeoutMillis : 30000
    });

    // borrow connection - callback function is called
    // once a resource becomes available
    pool.borrow(function(client) {
        client.query("select * from foo", [], function() {
            // return object back to pool
            pool.returnToPool(client);
        });
    });


## Documentation

    Pool() accepts an object with these slots:

             name : name of pool (string, optional)
           create : function that returns a new resource
                      should call callback() with the created resource
          destroy : function that accepts a resource and destroys it
              max : 


## Run Tests

    $ npm install expresso
    $ expresso -I lib test/*.js


