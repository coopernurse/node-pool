const Pool = require("../lib/Pool");

/**
 * Generic class for handling creation of resources
 * for testing
 */
var ResourceFactory = function ResourceFactory() {
  this.created = 0;
  this.destroyed = 0;
  this.bin = [];
};

ResourceFactory.prototype.create = function() {
  var id = this.created++;
  var resource = {
    id: id
  };
  return Promise.resolve(resource);
};

ResourceFactory.prototype.destroy = function(resource) {
  this.destroyed++;
  this.bin.push(resource);
  return Promise.resolve();
};

exports.ResourceFactory = ResourceFactory;

/**
 * drains and terminates the pool
 *
 * @param  {Pool} pool [description]
 * @return {Promise}      [description]
 */
exports.stopPool = function(pool) {
  return pool.drain().then(function() {
    return pool.clear();
  });
};
