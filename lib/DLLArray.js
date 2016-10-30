'use strict'

const DoublyLinkedList = require('./DoublyLinkedList')
const DLLArrayIterator = require('./DLLArrayIterator')
/**
 * DoublyLinkedList backed array
 * implements just enough to keep the Pool happy
 */
class DLLArray {
  constructor () {
    this._list = new DoublyLinkedList()
  }

  /**
   * removes the first element from an array and returns that element
   * @return {[type]} [description]
   */
  shift () {
    if (this._length === 0) {
      return undefined
    }

    const node = this._list.head
    this._list.remove(node)

    return node.data
  }

  /**
   * adds one elemts to the beginning of an array
   * @param  {[type]} element [description]
   * @return {[type]}         [description]
   */
  unshift (element) {
    const node = DoublyLinkedList.createNode(element)

    this._list.insertBeginning(node)
  }

  /**
   * adds one to the end of an array
   * @param  {[type]} element [description]
   * @return {[type]}         [description]
   */
  push (element) {
    const node = DoublyLinkedList.createNode(element)

    this._list.insertEnd(node)
  }

  [Symbol.iterator] () {
    return new DLLArrayIterator(this._list)
  }

  iterator () {
    return new DLLArrayIterator(this._list)
  }

  reverseIterator () {
    return new DLLArrayIterator(this._list, true)
  }

  get length () {
    return this._list.length
  }
}

module.exports = DLLArray
