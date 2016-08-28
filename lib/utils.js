/**
 * Everyones favourite dumping ground
 */

// Wrapper around setTimeout/nextTick/setImmediate whilst we still support
// pre 0.12 node
exports.nextLoop = function nextLoop (fn) {
  setTimeout(fn, 0)
}

// Turn sync validators into async validators
// work is deferred to the next event loop
// I'm pretty sure this is the worst way to actually write this
exports.syncValidationWrapper = function syncValidationWrapper (syncFn) {
  return function wrappedSyncValidator (resource, callback) {
    exports.nextLoop(function () {
      callback(syncFn(resource))
    })
  }
}
