"use strict";

const tap = require("tap");
const createPool = require("../").createPool;

tap.test("maxTries handles acquire exhausted calls", function(t) {
  let resourceCreationAttempts = 0;
  const factory = {
    create: function() {
      resourceCreationAttempts++;
      if (resourceCreationAttempts < 5) {
        return Promise.reject(new Error("Create Error"));
      }
      return Promise.resolve({});
    },
    destroy: function() {
      return Promise.resolve();
    }
  };
  const config = {
    maxTries: 3
  };

  const pool = createPool(factory, config);

  pool
    .acquire()
    .then(function(resource) {
      t.fail("wooops");
    })
    .catch(function(err) {
      t.match(err, /ResourceCreationError: Failed to create resource/);
      return pool.drain();
    })
    .then(function() {
      return pool.clear();
    })
    .then(function() {})
    .then(t.end)
    .catch(t.error);
});

tap.test("maxTries handles acquire non exhausted calls", function(t) {
  const myResource = {};
  let resourceCreationAttempts = 0;
  const factory = {
    create: function() {
      resourceCreationAttempts++;
      if (resourceCreationAttempts < 2) {
        return Promise.reject(new Error("Create Error"));
      }
      return Promise.resolve(myResource);
    },
    destroy: function() {
      return Promise.resolve();
    }
  };
  const config = {
    maxTries: 3
  };

  const pool = createPool(factory, config);

  pool
    .acquire()
    .then(function(resource) {
      t.equal(resource, myResource);
      pool.release(resource);
      return pool.drain();
    })
    .then(function() {
      return pool.clear();
    })
    .then(t.end)
    .catch(t.error);
});
