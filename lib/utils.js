/**
 * Everyones favourite dumping ground
 */

// Wrapper around setTimeout/nextTick/setImmediate whilst we still support
// pre 0.12 node
exports.nextLoop = function nextLoop (fn) {
  setTimeout(fn, 0)
}

