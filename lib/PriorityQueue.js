'use strict'

var Queue = require('./Queue')

/**
 * @class
 * @private
 */
function PriorityQueue (size) {
  if (!(this instanceof PriorityQueue)) {
    return new PriorityQueue()
  }

  this._size = Math.max(+size | 0, 1)
  this._slots = []
  // initialize arrays to hold queue elements
  for (var i = 0; i < size; i += 1) {
    this._slots.push(new Queue())
  }
}

module.exports = PriorityQueue

PriorityQueue.prototype.size = function size () {
  return this._slots.map(function (slot) { return slot.length }).reduce(add, 0)
}

PriorityQueue.prototype.enqueue = function enqueue (obj, priority) {
  var priorityOrig
  // Convert to integer with a default value of 0.
  priority = priority && +priority | 0 || 0

  if (priority) {
    priorityOrig = priority
    if (priority < 0 || priority >= this._size) {
      priority = (this._size - 1)
      // put obj at the end of the line
      console.error('invalid priority: ' + priorityOrig + ' must be between 0 and ' + priority)
    }
  }
  this._slots[priority].add(obj)
}

PriorityQueue.prototype.dequeue = function dequeue () {
  // FIXME: should this be undefined?
  var obj = null
  for (var i = 0, sl = this._slots.length; i < sl; i += 1) {
    if (this._slots[i].length) {
      obj = this._slots[i].remove()
      break
    }
  }
  return obj
}

PriorityQueue.prototype.peek = function peek () {
  // FIXME: should this be undefined?
  var obj = null
  for (var i = 0, sl = this._slots.length; i < sl; i += 1) {
    if (this._slots[i].length > 0) {
      obj = this._slots[i].peek()
      break
    }
  }
  return obj
}

function add (a, b) {
  return a + b
}
