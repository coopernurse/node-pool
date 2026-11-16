"use strict";

const tap = require("tap");
const createPool = require("../").createPool;
const utils = require("./utils");

tap.test(
  "rejected validation destroys the resource and serves waiting clients",
  function(t) {
    const factory = new utils.ResourceFactory();
    factory.validate = function(resource) {
      return resource.id === 0
        ? Promise.reject(new Error("validation failed"))
        : Promise.resolve(true);
    };
    const pool = createPool(factory, {
      max: 1,
      testOnBorrow: true,
      acquireTimeoutMillis: 1000
    });

    const firstAcquire = pool.acquire().then(function(resource) {
      t.equal(
        resource.id,
        1,
        "replaces the resource whose validation rejected"
      );
      t.equal(factory.destroyed, 1, "destroys the rejected resource once");
      t.equal(pool.pending, 1, "keeps the second client queued");
      return pool.release(resource);
    });
    const secondAcquire = pool.acquire().then(function(resource) {
      t.equal(resource.id, 1, "reuses the healthy replacement");
      t.equal(factory.created, 2, "does not create unnecessary replacements");
      t.equal(pool.pending, 0, "serves all waiting clients");
      return pool.release(resource);
    });

    return Promise.all([firstAcquire, secondAcquire])
      .then(function() {
        return utils.stopPool(pool);
      })
      .then(function() {
        t.equal(factory.destroyed, 2, "cleans up both resources");
        t.equal(pool.size, 0, "leaves no resources stuck in validation");
      });
  }
);

tap.test("drain serves pending clients after failed validation", function(t) {
  const factory = new utils.ResourceFactory();
  factory.validate = function(resource) {
    if (resource.id === 0) {
      return new Promise(function(resolve, reject) {
        setImmediate(function() {
          reject(new Error("validation failed"));
        });
      });
    }
    return Promise.resolve(resource.id !== 1);
  };
  const pool = createPool(factory, {
    min: 1,
    max: 1,
    testOnBorrow: true,
    acquireTimeoutMillis: 1000
  });

  const acquire = pool.acquire().then(function(resource) {
    t.equal(resource.id, 2, "skips both rejected and false validation results");
    t.equal(factory.destroyed, 2, "destroys both invalid resources");
    return pool.release(resource);
  });

  return Promise.all([acquire, pool.drain()])
    .then(function() {
      return pool.clear();
    })
    .then(function() {
      t.equal(
        factory.created,
        3,
        "does not replenish the minimum during drain"
      );
      t.equal(
        factory.destroyed,
        3,
        "destroys the healthy replacement on clear"
      );
      t.equal(pool.size, 0, "leaves the pool empty");
    });
});
