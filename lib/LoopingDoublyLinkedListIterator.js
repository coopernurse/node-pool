'use strict'

const DoublyLinkedListIterator = require('./DoublyLinkedListIterator')

/**
 * Terrible and non-standard iterator that will always return an item if the
 * list is not empty
 */
class LoopingDoublyLinkedListIterator extends DoublyLinkedListIterator {
  next () {
    const res = super.next()

    // we have something? carry on as usual
    if (res.done === false) {
      return res
    }

    // List is empty? carry on as usual
    if (this._list.head === null && this._list.tail === null) {
      return res
    }

    // if we get here the list is not empty and we can just reset the cursor
    // and try again
    this._start()
    return super.next()
  }

}
module.exports = LoopingDoublyLinkedListIterator
