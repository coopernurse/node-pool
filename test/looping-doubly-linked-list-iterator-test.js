const tap = require('tap')
const DLL = require('../lib/DoublyLinkedList')
const Iterator = require('../lib/LoopingDoublyLinkedListIterator')

tap.test('iterates forward and loops', function (t) {
  const dll = new DLL()

  const node1 = DLL.createNode({id: 1})
  const node2 = DLL.createNode({id: 2})
  const node3 = DLL.createNode({id: 3})
  const node4 = DLL.createNode({id: 4})

  dll.insertBeginning(node1)
  dll.insertBeginning(node2)
  dll.insertBeginning(node3)
  dll.insertBeginning(node4)

  const iterator = new Iterator(dll)

  const iterationResult1 = iterator.next()
  t.notOk(iterationResult1.done)
  t.same(iterationResult1.value, node4)

  iterator.next()
  iterator.next()
  iterator.next()

  const iterationResult2 = iterator.next()
  t.notOk(iterationResult2.done)
  t.same(iterationResult2.value, node4)

  t.end()
})

tap.test('iterates backwards and loops', function (t) {
  const dll = new DLL()

  const node1 = DLL.createNode({id: 1})
  const node2 = DLL.createNode({id: 2})
  const node3 = DLL.createNode({id: 3})
  const node4 = DLL.createNode({id: 4})

  dll.insertBeginning(node1)
  dll.insertBeginning(node2)
  dll.insertBeginning(node3)
  dll.insertBeginning(node4)

  const iterator = new Iterator(dll, true)

  const iterationResult1 = iterator.next()
  t.notOk(iterationResult1.done)
  t.same(iterationResult1.value, node1)

  iterator.next()
  iterator.next()
  iterator.next()

  const iterationResult2 = iterator.next()
  t.notOk(iterationResult2.done)
  t.same(iterationResult2.value, node1)

  t.end()
})

tap.test('stops iterating when list is empty', function (t) {
  const dll = new DLL()
  const iterator = new Iterator(dll)

  const node1 = DLL.createNode({id: 1})

  dll.insertBeginning(node1)

  const iterationResult1 = iterator.next()
  t.notOk(iterationResult1.done)
  t.same(iterationResult1.value, node1)

  dll.remove(node1)

  const iterationResult3 = iterator.next()
  t.ok(iterationResult3.done)

  t.end()
})
