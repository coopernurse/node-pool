'use strict'

class PooledResourceCollection {
  constructor () {
    /**
     * The primary store for PooledResources
     * @type {Set}
     */
    this._pooledResources = new Set()
    /**
     * Maintains a reverse lookup for finding "PooledResource" by it's resource
     * @type {WeakMap}
     */
    this._resourceLookup = new WeakMap()
  }

  /**
   * adds a pooled resource to the collection
   * @param {PooledResource} pooledResource [description]
   */
  addPooledResource (pooledResource) {
    this._pooledResources.add(pooledResource)
    this._resourceLookup.set(pooledResource.obj, pooledResource)
  }

  /**
   * Deletes the PooledResource from the collection
   * @param  {[type]} pooledResource [description]
   * @return {[type]}                [description]
   */
  remove (pooledResource) {
    return this._pooledResources.delete(pooledResource)
  }

  /**
   * Deletes the PooledResource from the collection for the supplied resource
   * @param  {Object} resource [description]
   * @return {Boolean}          [description]
   */
  removeByResource (resource) {
    const pooledResource = this._resourceLookup.get(resource)

    if (pooledResource === undefined) {
      return false
    }

    return this._pooledResources.delete(pooledResource)
  }

  /**
   * returns the PooledObject associated with the resource
   * @param  {Object} resource [description]
   * @return {PooledResource}          [description]
   */
  getByResource (resource) {
    const pooledResource = this._resourceLookup.get(resource)

    if (pooledResource === undefined) {
      return null
    }
    return pooledResource
  }

  get size () {
    return this._pooledResources.size
  }
}

module.exports = PooledResourceCollection
