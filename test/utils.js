/**
 * Generic class for handling creation of resources
 * for testing
 */
var ResourceFactory = function ResourceFactory () {
  this.created = 0
  this.destroyed = 0
  this.bin = []
}

ResourceFactory.prototype.create = function (callback) {
  var resource = {
    id: this.created++
  }
  setTimeout(function () {
    callback(resource)
  }, 1)
}

ResourceFactory.prototype.destroy = function (resource) {
  this.destroyed++
  this.bin.push(resource)
}

exports.ResourceFactory = ResourceFactory

/**
 * drains and terminates the pool
 *
 * @param  {[type]} pool [description]
 * @return {[type]}      [description]
 */
exports.stopPool = function (pool) {
  pool.drain(function () {
    pool.destroyAllNow()
  })
}
