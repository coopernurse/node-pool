'use strict'

const DoublyLinkedList = require('./DoublyLinkedList')

/**
 * Sort of a internal queue for holding the waiting
 * resource requets for a given "priority".
 * Also handles managing timeouts on items (is this the best place for this?)
 * This is the last point where we know which queue a resourceRequest is in
 *
 */
class Queue {
  constructor () {
    this._list = new DoublyLinkedList()
    this.length = 0
  }

  /**
   * Adds the obj to the end of the list for this slot
   * @param {[type]} item [description]
   */
  add (resourceRequest) {
    const node = DoublyLinkedList.createNode(resourceRequest)

    // TODO: we should be able to check a public property instead of
    // this 'private' variable
    if (resourceRequest._timeout) {
      node._timeoutEventHandler = this._createTimeoutEventHandler(node)
      resourceRequest.once('timeout', node._timeoutEventHandler)
    }

    this._list.insertEnd(node)
    this.length++
  }

  /**
   * Removes and returns the obj at the head of the list for this slot
   * @return {ResourceRequest} [description]
   */
  remove () {
    if (this.length === 0) {
      return undefined
    }

    const node = this._list.head
    this._list.remove(node)

    // Remove the timeout handler as has a reference to the node
    if (node._timeoutEventHandler) {
      node.data.removeListener('timeout', node._timeoutEventHandler)
    }

    this.length--
    return node.data
  }

  peek () {
    if (this.length === 0) {
      return undefined
    }
    const node = this._list.head
    return node.data
  }

  _createTimeoutEventHandler (node) {
    const self = this
    return function timeoutEventHandler () {
      self._list.remove(node)
      self.length--
    }
  }
}

module.exports = Queue