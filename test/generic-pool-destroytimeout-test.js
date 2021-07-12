"use strict";

const tap = require("tap");
const createPool = require("../").createPool;

tap.test("destroyTimeout handles timed out destroy calls", function(t) {
  const factory = {
    create: function() {
      return Promise.resolve({});
    },
    destroy: function() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve();
        }, 100);
      });
    }
  };
  const config = {
    destroyTimeoutMillis: 20
  };

  const pool = createPool(factory, config);

  pool
    .acquire()
    .then(function(resource) {
      pool.destroy(resource);
      return new Promise(function(resolve, reject) {
        pool.on("factoryDestroyError", function(err) {
          t.match(err, /destroy timed out/);
          resolve();
        });
      });
    })
    .then(t.end)
    .catch(t.error);
});

tap.test("destroyTimeout handles non timed out destroy calls", function(t) {
  const myResource = {};
  const factory = {
    create: function() {
      return Promise.resolve({});
    },
    destroy: function() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve();
        }, 10);
      });
    }
  };

  const config = {
    destroyTimeoutMillis: 400
  };

  const pool = createPool(factory, config);

  pool
    .acquire()
    .then(function(resource) {
      pool.destroy(resource);
      return new Promise(function(resolve) {
        pool.on("factoryDestroyError", function(err) {
          t.fail("wooops");
        });
        setTimeout(resolve, 20);
      });
    })
    .then(t.end)
    .catch(t.error);
});
