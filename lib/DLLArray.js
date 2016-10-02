'use strict'

const DoublyLinkedList = require('./DoublyLinkedList')

/**
 * DoublyLinkedList backed array
 * implements just enough to keep the Pool happy
 */
class DLLArray {
  constructor () {
    this._list = new DoublyLinkedList()
    this._length = 0
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

    this._length--
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
    this._length++
  }

  /**
   * adds one  to the end of an array
   * @param  {[type]} element [description]
   * @return {[type]}         [description]
   */
  push (element) {
    const node = DoublyLinkedList.createNode(element)

    this._list.insertEnd(node)
    this._length++
  }

  //
  /**
   * Not quite compliant forEach impl -
   * maybe move to an iterator?
   * @param  {Function} callback only given currentValue and index
   * @param  {[type]}   thisArg  [description]
   */
  forEach (callback, thisArg) {
    const len = this._length
    let k = 0
    const T = (arguments.length > 1) ? thisArg : undefined

    if (this === null) {
      throw new TypeError('this is null or not defined')
    }

    if (typeof callback !== 'function') {
      throw new TypeError(callback + ' is not a function')
    }

    // if nothing in array just bail
    if (len <= k) {
      return
    }

    let currentNode = this._list.head

    while (k < len) {
      const kValue = currentNode.data
      callback.call(T, kValue, k)
      k++
      currentNode = currentNode.next
    }
  }

  get length () {
    return this._length
  }
}

module.exports = DLLArray
