---
title: 整活：在 Go 中手动分配内存
pubDate: 2022-05-07T20:17:33+08:00
tags:
  - go
  - cgo
  - jemalloc
  - memory-allocator
toc: true
---

{% note warning %}
在 Go 中手动分配内存的实际意义不大，真有需求不如换门语言
{% endnote %}

好早之前就看到了 Dgraph 的那篇文章（[Manual Memory Management in Go using jemalloc](https://dgraph.io/blog/post/manual-memory-management-golang-jemalloc/)），今天仔细读了一遍，尝试尝试 Go + jemalloc 的模式。

<!-- more -->

## 编译安装 jemalloc

环境：Ubuntu 20.04.4 LTS on Windows 10 x86_64

从 GitHub 上下载 jemalloc 的源码，切换到最新 release 的 tag 然后按照 [INSTALL.md](https://github.com/jemalloc/jemalloc/blob/5.3.0/INSTALL.md) 操作：

```bash
git clone https://github.com/jemalloc/jemalloc.git && cd jemalloc
git checkout 5.3.0
./autogen.sh --with-jemalloc-prefix=je_ --with-malloc-conf='background_thread:true,metadata_thp:auto'
make -j
sudo make install # 通过 sudo make uninstall 可以卸载
```

## 通过 cgo 调用

简单封装一下

```go
/*
#cgo LDFLAGS: -L/usr/local/lib -Wl,-rpath,/usr/local/lib -ljemalloc -lm -lstdc++ -pthread -ldl
#include <stdlib.h>
#include <jemalloc/jemalloc.h>
*/
import "C"
import (
	"sync/atomic"
	"unsafe"
)

const MaxArrayLen = 1<<50 - 1

var numBytes int64

//go:linkname throw runtime.throw
func throw(s string)

func Calloc(n int) []byte {
	if n == 0 {
		return make([]byte, 0)
	}

	ptr := C.je_calloc(C.size_t(n), 1)
	if ptr == nil {
		throw("out of memory")
	}

	atomic.AddInt64(&numBytes, int64(n))
	return (*[MaxArrayLen]byte)(unsafe.Pointer(ptr))[:n:n]
}

func Free(b []byte) {
	if sz := cap(b); sz > 0 {
		b = b[:cap(b)]
		ptr := unsafe.Pointer(&b[0])
		C.je_free(ptr)
		atomic.AddInt64(&numBytes, -int64(sz))
	}
}

func NumAllocBytes() int64 {
	return atomic.LoadInt64(&numBytes)
}
```

## 用 Calloc 给结构体分配内存

注意 jemalloc 分配的结构体里的指针不能引用 golang 分配的地址，被垃圾回收了之后再访问会出现段错误

```go
type node struct {
	val  int
	next *node
}
```

jemalloc 版本

```go
//go:build jemalloc

import "unsafe"

var nodeSz = int(unsafe.Sizeof(node{}))

func newNode(val int) *node {
	b := Calloc(nodeSz)
	n := (*node)(unsafe.Pointer(&b[0]))
	n.val = val
	return n
}

func freeNode(n *node) {
	b := (*[MaxArrayLen]byte)(unsafe.Pointer(n))[:nodeSz:nodeSz]
	Free(b)
}
```

golang 版本

```go
//go:build !jemalloc

func newNode(val int) *node {
	return &node{val: val}
}

func freeNode(n *node) {}
```

主函数

```go
package main

import (
	"fmt"
	"runtime"

	"github.com/dustin/go-humanize"
)

const N = 2000001

func main() {
	root := newNode(-1)
	n := root
	for i := 0; i < N; i++ {
		nn := newNode(i)
		n.next = nn
		n = nn
	}

	printNode(root)

	runtime.GC()
	printMem()

	n = root
	for n != nil {
		left := n
		n = n.next
		freeNode(left)
	}

	runtime.GC()
	fmt.Println("After GC...")
	printMem()
}

func printMem() {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	fmt.Printf("HeapAlloc: %v\n", humanize.IBytes(ms.HeapAlloc))

	fmt.Printf("OffHeap: %v\n", humanize.IBytes(uint64(NumAllocBytes())))
}

func printNode(n *node) {
	if n == nil {
		return
	}
	if n.val%100000 == 0 {
		fmt.Printf("node: %d\n", n.val)
	}
	printNode(n.next)
}
```

输出结果：

```bash
$ go run .
node: 0
...
node: 2000000
HeapAlloc: 31 MiB
OffHeap: 0 B
After GC...
HeapAlloc: 92 KiB
OffHeap: 0 B

$ go run -tags jemalloc .
node: 0
...
node: 2000000
HeapAlloc: 90 KiB
OffHeap: 30 MiB
After GC...
HeapAlloc: 92 KiB
OffHeap: 0 B
```
