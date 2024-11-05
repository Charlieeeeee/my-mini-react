export type Heap<T extends Node> = Array<T>
export type Node = {
  sortIndex: number
  id: number
}

export function push<T extends Node>(heap: Heap<T>, node: T): void {
  const index = heap.length
  heap.push(node)
  shiftUp(heap, index)
}

export function peek<T extends Node>(heap: Heap<T>): T | null {
  return heap.length === 0 ? null : heap[0]
}

export function pop<T extends Node>(heap: Heap<T>): T | null {
  if (heap.length === 0) return null 
  const first = heap[0]
  const last = heap.pop()
  if (first !== last) {
    heap[0] = last as T
    shiftDown(heap, 0)
  }
  return first
}

export function shiftUp(heap: Heap<Node>, i: number): void {
  let parentIndex = (i - 1) >> 1
  while(parentIndex >= 0 && compare(heap[i], heap[parentIndex]) < 0) {
    [heap[i], heap[parentIndex]] = [heap[parentIndex], heap[i]]
    i = parentIndex
    parentIndex = (i - 1) >> 1
  }
}

export function shiftDown(heap: Heap<Node>, i: number): void {
  let leftIndex = i * 2 + 1
  let rightIndex = i * 2 + 2
  let current = i
  const length = heap.length
  if (leftIndex < length && compare(heap[leftIndex], heap[current]) < 0) {
    current = leftIndex
  }
  if (rightIndex < length && compare(heap[rightIndex], heap[current]) < 0) {
    current = rightIndex
  }
  if (current !== i) {
    [heap[i], heap[current]] = [heap[current], heap[i]]
    shiftDown(heap, current)
  }
}

export function compare(a: Node, b: Node): number {
  const diff =  a.sortIndex - b.sortIndex
  return diff ? diff : a.id - b.id
}

