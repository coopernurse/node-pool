"use strict";

class DefaultEvictor {
  evict(config, pooledResource, availableObjectsCount) {
    const idleTime = Date.now() - pooledResource.lastIdleTime;
    const age = Date.now() - pooledResource.creationTime;

    if (
      config.softIdleTimeoutMillis > 0 &&
      config.softIdleTimeoutMillis < idleTime &&
      config.min < availableObjectsCount
    ) {
      return true;
    }

    if (config.idleTimeoutMillis < idleTime) {
      return true;
    }

    if (config.maxAgeMillis > 0 && config.maxAgeMillis < age) {
      return true;
    }

    return false;
  }
}

module.exports = DefaultEvictor;
