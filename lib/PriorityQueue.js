'use strict'

const Queue = require('./Queue')

/**
 * @class
 * @private
 */
class PriorityQueue {
  constructor (size) {
    this._size = Math.max(+size | 0, 1)
    this._slots = []
    // initialize arrays to hold queue elements
    for (let i = 0; i < this._size; i++) {
      this._slots.push(new Queue())
    }
  }

  get size () {
    let _size = 0
    for (let i = 0, slots = this._slots.length; i < slots; i++) {
      _size += this._slots[i].length
    }
    return _size
  }

  enqueue (obj, priority) {
    let priorityOrig
    // Convert to integer with a default value of 0.
    priority = priority && +priority | 0 || 0

    if (priority) {
      priorityOrig = priority
      if (priority < 0 || priority >= this._size) {
        priority = (this._size - 1)
        // put obj at the end of the line
        // FIXME: remove this logging
        console.trace('invalid priority: ' + priorityOrig + ' must be between 0 and ' + priority)
      }
    }
    this._slots[priority].add(obj)
  }

  dequeue () {
    // FIXME: should this be undefined?
    for (let i = 0, sl = this._slots.length; i < sl; i += 1) {
      if (this._slots[i].length) {
        return this._slots[i].remove()
      }
    }
    return null
  }

  peek () {
    // FIXME: should this be undefined?
    for (let i = 0, sl = this._slots.length; i < sl; i += 1) {
      if (this._slots[i].length > 0) {
        return this._slots[i].peek()
      }
    }
    return null
  }
}

module.exports = PriorityQueue
