var PooledResourceStateEnum = require('./PooledResourceStateEnum')

/**
 * @class
 * @private
 */
function PooledResource (resource) {
  this.creationTime = Date.now()
  this.lastReturnTime = null
  this.lastBorrowTime = null
  this.lastIdleTime = null
  this.obj = resource
  this.state = PooledResourceStateEnum.IDLE
}

module.exports = PooledResource

// mark the resource as "allocated"
PooledResource.prototype.allocate = function allocate () {
  this.lastBorrowTime = Date.now()
  this.state = PooledResourceStateEnum.ALLOCATED
}

// mark the resource as "deallocated"
PooledResource.prototype.deallocate = function deallocate () {
  this.lastReturnTime = Date.now()
  this.state = PooledResourceStateEnum.IDLE
}

PooledResource.prototype.invalidate = function invalidate () {
  this.state = PooledResourceStateEnum.INVALID
}

PooledResource.prototype.test = function test () {
  this.state = PooledResourceStateEnum.VALIDATION
}

PooledResource.prototype.idle = function idle () {
  this.lastIdleTime = Date.now()
  this.state = PooledResourceStateEnum.IDLE
}

PooledResource.prototype.returning = function returning () {
  this.state = PooledResourceStateEnum.RETURNING
}
