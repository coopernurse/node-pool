'use strict'

const DoublyLinkedList = require('./DoublyLinkedList')

/**
 * Sort of a internal queue for holding the waiting
 * resource requets for a given "priority".
 * Also handles managing timeouts rejections on items (is this the best place for this?)
 * This is the last point where we know which queue a resourceRequest is in
 *
 */
class Queue {
  constructor () {
    this._list = new DoublyLinkedList()
    this._length = 0
  }

  get length () {
    return this._length
  }

  /**
   * Adds the obj to the end of the list for this slot
   * @param {[type]} item [description]
   */
  add (resourceRequest) {
    const node = DoublyLinkedList.createNode(resourceRequest)

    resourceRequest.promise.catch(this._createTimeoutRejectionHandler(node))

    this._list.insertEnd(node)
    this._length++
  }

  /**
   * Removes and returns the obj at the head of the list for this slot
   * @return {ResourceRequest} [description]
   */
  remove () {
    if (this._length === 0) {
      return undefined
    }

    const node = this._list.head
    this._list.remove(node)

    this._length--
    return node.data
  }

  /**
   * get a reference to the item at the head of the queue
   * @return {ResourceRequest} [description]
   */
  get head () {
    if (this._length === 0) {
      return undefined
    }
    const node = this._list.head
    return node.data
  }

  /**
   * get a reference to the item at the tail of the queue
   * @return {ResourceRequest} [description]
   */
  get tail () {
    if (this._length === 0) {
      return undefined
    }
    const node = this._list.tail
    return node.data
  }

  _createTimeoutRejectionHandler (node) {
    return (reason) => {
      if (reason.name === 'TimeoutError') {
        this._list.remove(node)
        this._length--
      }
    }
  }
}

module.exports = Queue
