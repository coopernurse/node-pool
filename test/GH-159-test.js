const tap = require("tap");
const createPool = require("../").createPool;
const utils = require("./utils");
const ResourceFactory = utils.ResourceFactory;

class ResourceFactoryDelayCreateEachSecond {
  constructor() {
    this.callCreate = 0;
    this.created = 0;
    this.destroyed = 0;
    this.bin = [];
  }

  create() {
    const that = this;
    console.log(`** create call ${that.callCreate}`);
    return new Promise(resolve => {
      if (that.callCreate % 2 === 0) {
        setTimeout(function() {
          console.log(`** created ${that.created}`);
          resolve({ id: that.created++ });
        }, 10);
      } else {
        console.log(`** created ${that.created}`);
        resolve({ id: that.created++ });
      }
      that.callCreate++;
    });
  }

  validate() {
    return Promise.resolve(true);
  }

  destroy(resource) {
    console.log(`** destroying ${resource.id}`);
    this.destroyed++;
    this.bin.push(resource);
    return Promise.resolve();
  }
}

tap.test("tests drain clear with autostart and min > 0", function(t) {
  const count = 5;
  let acquired = 0;

  const resourceFactory = new ResourceFactoryDelayCreateEachSecond();
  const config = {
    max: 10,
    min: 1,
    evictionRunIntervalMillis: 500,
    idleTimeoutMillis: 30000,
    testOnBorrow: true,
    autostart: true
  };
  const pool = createPool(resourceFactory, config);

  return pool
    .drain()
    .then(function() {
      console.log("** pool drained");
      return pool.clear();
    })
    .then(function() {
      console.log("** pool cleared");
      t.equal(resourceFactory.created, resourceFactory.destroyed);
    })
    .then(function() {
      t.end();
    });
});
