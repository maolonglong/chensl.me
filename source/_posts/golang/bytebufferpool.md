---
title: 高性能字节池 - bytebufferpool 源码分析
date: 2021-06-28 16:19:02
categories: Golang
tags:
  - pool
---

## 简介

今天的主角是 [bytebufferpool](https://github.com/valyala/bytebufferpool) ，仓库的 README 文件是这么描述 bytebufferpool 的：

> Currently bytebufferpool is fastest and most effective buffer pool written in Go.

<!-- more -->

bytebufferpool 基本上是目前 Go 实现的最快的字节池，在许多优秀项目中都有被使用（[fasthttp](https://github.com/valyala/fasthttp), [quicktemplate](https://github.com/valyala/quicktemplate), [gnet](https://github.com/panjf2000/gnet)）

什么是字节池？在读取文件或者从 `io.Reader` 获取数据时，一般都需要创建一个字节切片 `[]byte` 作为缓冲，如果对于这种方法有大量的调用，就会频繁地创建 `[]byte` ，这需要太多内存的申请和释放，增大了 GC 的压力。这个时候“池化”技术就派上了用场，通过复用对象以减少内存的分配和释放。

```go
package main

import (
    "fmt"
    "io"
    "log"
    "os"
)

func main() {
    r, _ := os.Open("./main.go")
    // 普通方式
    buf := make([]byte, 64)
    for {
        n, err := r.Read(buf)
        if err != nil {
            if err == io.EOF {
                break
            }
            log.Fatal(err)
        }
        fmt.Print(string(buf[:n]))
    }
}
```

## 简单实现

### MinIO BytePoolCap

MinIO 中使用 `channel` 实现了一个非常简单的**有界**字节池 [bpool](https://github.com/minio/minio/blob/master/internal/bpool/bpool.go)

```go
type BytePoolCap struct {
    c    chan []byte
    w    int
    wcap int
}

func NewBytePoolCap(maxSize int, width int, capwidth int) (bp *BytePoolCap) {
    return &BytePoolCap{
        c:    make(chan []byte, maxSize),
        w:    width,
        wcap: capwidth,
    }
}
```

- `c` 用来存放字节切片（这也就是为什么**有界**的原因）
- `w` 表示创建字节切片的 `len`
- `wcap` 表示创建字节切片的 `cap`

`Get()` 方法, 从池中获取字节切片：

```go
func (bp *BytePoolCap) Get() (b []byte) {
    select {
    case b = <-bp.c:
        // channel 中存在 []byte 则复用
    default:
        // 否则创建 []byte
        if bp.wcap > 0 {
            b = make([]byte, bp.w, bp.wcap)
        } else {
            b = make([]byte, bp.w)
        }
    }
    return
}
```

`Put([]byte)` 方法，将使用完的切片放回池中，以被下一次获取：

```go
func (bp *BytePoolCap) Put(b []byte) {
    select {
    case bp.c <- b:
        // channel 放得下
    default:
        // channel 放不下的话则不进行任何操作，直接丢弃这个 []byte
    }
}
```

使用示例

```go
// 多个 goroutine 公用一个 pool
var bp = bpool.NewBytePoolCap(100, 64, 64)

// func ...
buf := bp.Get()
defer bp.Put(buf)

// use buf ...
```

### sync.Pool

谈到“池”，很容易想到 Go 标准库中的 `sync.Pool`，我们可以用几行代码就实现一个简单的字节池：

```go
pool := &sync.Pool{
    New: func() interface{} {
        return make([]byte, 64)
    },
}
```

然后就可以使用 `pool.Get().([]byte)` 从池中取字节切片，使用完后调用 `pool.Put(buf)` 归还到池中。

## 问题分析

上面的两种字节池实现都存在许多问题：池中新建的字节切片的 `len` 和 `cap` 都是创建池的时候固定的，不能动态修改。另外，如果往字节切片写入了大量数据（发生多次扩容），此时再将这样的字节切片放回池中，显然会造成内存浪费。

所以需要解决的问题：

1. 动态修改新分配字节切片的大小
2. 阻止大切片放回字节池

## ByteBufferPool

ByteBufferPool 中实现了一个类似 `bytes.Buffer` 的结构（[ByteBuffer](https://github.com/valyala/bytebufferpool/blob/master/bytebuffer.go)），它封装了一些对 `[]byte` 的复杂操作，从 benchmark 的结果可以看出它的性能比 `bytes.Buffer` 略高一些，但它不是字节池的重点，所以就不贴代码了。

ByteBufferPool 是怎么解决上述问题的？

```go
const (
    minBitSize = 6  // 2**6=64 is a CPU cache line size

    // 将 buf 的大小划分为 20 个区间
    // ==> (0, 64], (64, 128], (128, 256], ... , (8388608, 16777216], (16777216, 33554432]
    // 超过 33554432 的也属于最后一个区间
    steps = 20

    minSize = 1 << minBitSize               // 64
    maxSize = 1 << (minBitSize + steps - 1) // 33554432

    calibrateCallsThreshold = 42000
    maxPercentile           = 0.95
)

type Pool struct {
    calls       [steps]uint64 // 不同大小 buf 的使用频次
    calibrating uint64        // 标记是否正在校准（校准过程就是调整 defaultSize 和 maxSize）

    defaultSize uint64 // make []byte 时的 cap
    maxSize     uint64 // 能放回池中的最大 buf 大小

    pool sync.Pool // 存储 buf
}

func (p *Pool) Get() *ByteBuffer {
    v := p.pool.Get()
    // 如果池中有 buf 直接返回
    if v != nil {
        return v.(*ByteBuffer)
    }
    // 否则新建一个 cap 为 defaultSize 的 buf
    return &ByteBuffer{
        B: make([]byte, 0, atomic.LoadUint64(&p.defaultSize)),
    }
}
```

继续查看 `Put()`，从这就可以看出 ByteBufferPool 的主要逻辑了：

```go
func (p *Pool) Put(b *ByteBuffer) {
    // len 所在 “区间” 的下标
    idx := index(len(b.B))

    // 解决了问题1：动态调整 size
    // 使用频次加1，如果超过了阈值（42000）则进行校准
    if atomic.AddUint64(&p.calls[idx], 1) > calibrateCallsThreshold {
        p.calibrate()
    }

    // 解决了问题2：阻止大切片放回字节池
    // 如果还未设置 maxSize 或 cap 小于等于 maxSize 才执行 Put
    maxSize := int(atomic.LoadUint64(&p.maxSize))
    if maxSize == 0 || cap(b.B) <= maxSize {
        b.Reset()
        p.pool.Put(b)
    }
}

func index(n int) int {
    n--
    n >>= minBitSize
    idx := 0
    for n > 0 {
        n >>= 1
        idx++
    }
    if idx >= steps {
        idx = steps - 1
    }
    return idx
}
```

划分区间的目的就是方便统计出程序近一段时间内**最经常使用**多大的 buf，从而决定 `defaultSize` 和 `maxSize`，这一块的逻辑主要在 `calibrate()` ：

```go
func (p *Pool) calibrate() {
    // 通过 CAS 确保同一时刻只有一个 goroutine 执行 calibrate
    if !atomic.CompareAndSwapUint64(&p.calibrating, 0, 1) {
        return
    }

    a := make(callSizes, 0, steps)
    // 所有大小 buf 的总使用频次
    var callsSum uint64
    for i := uint64(0); i < steps; i++ {
        calls := atomic.SwapUint64(&p.calls[i], 0)
        callsSum += calls
        a = append(a, callSize{
            calls: calls,
            size:  minSize << i,
        })
    }
    // 按照使用频次从大到小排序
    sort.Sort(a)

    // 将 defaultSize 设置为频次最高的 size
    defaultSize := a[0].size
    maxSize := defaultSize

    // 选择 maxSize，让 95% 的 buf 都能被归还到池中，只有最大的 %5 无法归还
    maxSum := uint64(float64(callsSum) * maxPercentile)
    callsSum = 0
    for i := 0; i < steps; i++ {
        if callsSum > maxSum {
            break
        }
        callsSum += a[i].calls
        size := a[i].size
        if size > maxSize {
            maxSize = size
        }
    }

    // 因为 pool 会被多个 goroutine 访问，所以需要使用原子写入
    atomic.StoreUint64(&p.defaultSize, defaultSize)
    atomic.StoreUint64(&p.maxSize, maxSize)

    atomic.StoreUint64(&p.calibrating, 0)
}

type callSize struct {
    calls uint64 // 使用频次
    size  uint64 // buf 大小
}

type callSizeSlice []callSize

func (a callSizeSlice) Len() int           { return len(a) }
func (a callSizeSlice) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a callSizeSlice) Less(i, j int) bool { return a[i].calls > a[j].calls }
```

## 性能测试

[pool_bench_test.go](https://github.com/MaoLongLong/bytebufferpool/blob/main/pool_bench_test.go)

从上往下，分别为 ByteBufferPool, MinIO BytePoolCap 和普通 `[]byte`

```bash
$ go test -bench=Pool -benchmem
goos: linux
goarch: amd64
pkg: github.com/maolonglong/bytebufferpool
cpu: Intel(R) Core(TM) i7-7500U CPU @ 2.70GHz
BenchmarkByteBufferPoolBuf-4    20764896                52.71 ns/op            0 B/op          0 allocs/op
BenchmarkBPool-4                 7899157               156.4 ns/op             0 B/op          0 allocs/op
BenchmarkWithoutPool-4           4511701               270.5 ns/op          1472 B/op          3 allocs/op
PASS
ok      github.com/maolonglong/bytebufferpool   4.091s
```

从测试结果可以看出，ByteBufferPool 不管在速度还是内存上都优于另外两种方案。

## 总结

GitHub 上许多优秀的项目其实代码并不难，通过这些项目可以学习大佬们设计、优化代码的思想，提升自己解决实际问题的能力。
