/**
 * Not particuarly memory/cpu efficient band-aid for a map/set
 *
 */
function PooledResourceCollection () {
  this._collection = []
}

module.exports = PooledResourceCollection

/**
 * adds a pooled resource to the collection
 * @param {PooledResource} pooledResource [description]
 */
PooledResourceCollection.prototype.addPooledResource = function (pooledResource) {
  this._collection.push(pooledResource)
}

/**
 * Deletes the PooledResource from the collection for the supplied resource
 * @param  {Object} resource [description]
 * @return {Boolean}          [description]
 */
PooledResourceCollection.prototype.removeByResource = function (resource) {
  var pos = this._find(resource)
  if (pos === null) {
    return false
  }
  this._collection.splice(pos, 1)
  return true
}

/**
 * returns the PooledObject associated with the resource
 * @param  {Object} resource [description]
 * @return {PooledResource}          [description]
 */
PooledResourceCollection.prototype.getByResource = function (resource) {
  var pos = this._find(resource)
  if (pos === null) {
    return null
  }
  return this._collection[pos]
}

/**
 * Deletes the PooledResource from the collection for the supplied resource and
 * returns that PooledResource or null if didn't exist
 * @param  {Object} resource [description]
 * @return {PooledResource}          [description]
 */
PooledResourceCollection.prototype.pullByResource = function (resource) {
  var pos = this._find(resource)
  if (pos === null) {
    return null
  }
  return this._collection.splice(pos, 1)[0]
}

/**
 * finds the internal index for a given a resource
 * best case it should reduce the number of operations required
 * to get/remove/find
 * FIXME: should this default to -1 rather than null
 * @param  {[type]} resource [description]
 * @return {[type]}          [description]
 */
PooledResourceCollection.prototype._find = function (resource) {
  var position = null
  for (var idx = 0, len = this._collection.length; idx < len; idx++) {
    if (this._collection[idx].obj === resource) {
      position = idx
      break
    }
  }
  return position
}

PooledResourceCollection.prototype.size = function () {
  return this._collection.length
}
