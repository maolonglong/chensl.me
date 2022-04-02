---
title: 无锁队列的简单实现
date: 2021-06-25 16:16:59
categories: Golang
tags:
  - 并发
  - CAS
  - unsafe
---

谈到无锁队列，就不得不提 Michael 和 Scott 在 1996 年发表的论文 [Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms](https://www.cs.rochester.edu/u/scott/papers/1996_PODC_queues.pdf)，Java 中 `ConcurrentLinkedQueue` 也是基于该论文的算法实现。

<!-- more -->

## 伪代码

论文中 lock-free queue 算法的伪代码：

正如论文的题目描述的，它非常简单，代码量很少。主要思路就是使用 [CAS](https://zh.wikipedia.org/wiki/%E6%AF%94%E8%BE%83%E5%B9%B6%E4%BA%A4%E6%8D%A2) 操作队列的头指针和尾指针，以实现线程安全。

```text
structure pointer_t {ptr: pointer to node_t, count: unsigned integer}
structure node_t {value: data type, next: pointer_t}
structure queue_t {Head: pointer_t, Tail: pointer_t}

initialize(Q: pointer to queue_t)
   node = new_node()		// Allocate a free node
   node->next.ptr = NULL	// Make it the only node in the linked list
   Q->Head.ptr = Q->Tail.ptr = node	// Both Head and Tail point to it

enqueue(Q: pointer to queue_t, value: data type)
 E1:   node = new_node()	// Allocate a new node from the free list
 E2:   node->value = value	// Copy enqueued value into node
 E3:   node->next.ptr = NULL	// Set next pointer of node to NULL
 E4:   loop			// Keep trying until Enqueue is done
 E5:      tail = Q->Tail	// Read Tail.ptr and Tail.count together
 E6:      next = tail.ptr->next	// Read next ptr and count fields together
 E7:      if tail == Q->Tail	// Are tail and next consistent?
             // Was Tail pointing to the last node?
 E8:         if next.ptr == NULL
                // Try to link node at the end of the linked list
 E9:            if CAS(&tail.ptr->next, next, <node, next.count+1>)
E10:               break	// Enqueue is done.  Exit loop
E11:            endif
E12:         else		// Tail was not pointing to the last node
                // Try to swing Tail to the next node
E13:            CAS(&Q->Tail, tail, <next.ptr, tail.count+1>)
E14:         endif
E15:      endif
E16:   endloop
       // Enqueue is done.  Try to swing Tail to the inserted node
E17:   CAS(&Q->Tail, tail, <node, tail.count+1>)

dequeue(Q: pointer to queue_t, pvalue: pointer to data type): boolean
 D1:   loop			     // Keep trying until Dequeue is done
 D2:      head = Q->Head	     // Read Head
 D3:      tail = Q->Tail	     // Read Tail
 D4:      next = head.ptr->next    // Read Head.ptr->next
 D5:      if head == Q->Head	     // Are head, tail, and next consistent?
 D6:         if head.ptr == tail.ptr // Is queue empty or Tail falling behind?
 D7:            if next.ptr == NULL  // Is queue empty?
 D8:               return FALSE      // Queue is empty, couldn't dequeue
 D9:            endif
                // Tail is falling behind.  Try to advance it
D10:            CAS(&Q->Tail, tail, <next.ptr, tail.count+1>)
D11:         else		     // No need to deal with Tail
                // Read value before CAS
                // Otherwise, another dequeue might free the next node
D12:            *pvalue = next.ptr->value
                // Try to swing Head to the next node
D13:            if CAS(&Q->Head, head, <next.ptr, head.count+1>)
D14:               break             // Dequeue is done.  Exit loop
D15:            endif
D16:         endif
D17:      endif
D18:   endloop
D19:   free(head.ptr)		     // It is safe now to free the old node
D20:   return TRUE                   // Queue was not empty, dequeue succeeded
```

## 实现

简单起见，不考虑 [ABA](https://en.wikipedia.org/wiki/ABA_problem) 问题，所以没有实现带版本号的 CAS

```go
import (
    "sync/atomic"
    "unsafe"
)

type lockFreeQueue struct {
    head unsafe.Pointer
    tail unsafe.Pointer
    len  int32
}

type node struct {
    value interface{}
    next  unsafe.Pointer
}

func NewLockFreeQueue() *lockFreeQueue {
    n := unsafe.Pointer(&node{})
    return &lockFreeQueue{head: n, tail: n}
}

func (q *lockFreeQueue) Enqueue(v interface{}) {
    n := &node{value: v}
    for {
        tail := load(&q.tail)
        next := load(&tail.next)
        if tail == load(&q.tail) {
            if next == nil {
                if cas(&tail.next, next, n) {
                    cas(&q.tail, tail, n)
                    atomic.AddInt32(&q.len, 1)
                    return
                }
            } else {
                cas(&q.tail, tail, next)
            }
        }
    }
}

func (q *lockFreeQueue) Dequeue() interface{} {
    for {
        head := load(&q.head)
        tail := load(&q.tail)
        next := load(&head.next)
        if head == load(&q.head) {
            if head == tail {
                if next == nil {
                    return nil
                }
                cas(&q.tail, tail, next)
            } else {
                v := next.value
                if cas(&q.head, head, next) {
                    atomic.AddInt32(&q.len, -1)
                    return v
                }
            }
        }
    }
}

func (q *lockFreeQueue) Empty() bool {
    return atomic.LoadInt32(&q.len) != 0
}

func load(p *unsafe.Pointer) *node {
    return (*node)(atomic.LoadPointer(p))
}

func cas(p *unsafe.Pointer, old, new *node) bool {
    return atomic.CompareAndSwapPointer(p,
        unsafe.Pointer(old), unsafe.Pointer(new))
}
```
