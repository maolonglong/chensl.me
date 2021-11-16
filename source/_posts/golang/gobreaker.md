---
title: 熔断器模式
date: 2021-09-16 16:21:28
categories: Golang
tags:
  - 微服务
---

熔断器模式提高了系统从故障恢复时的稳定性，最小化了故障对性能的影响。

## 背景和问题

在复杂的网络环境下，执行远程调用可能会遇到各种超时或故障，虽然大部分情况这些问题能在短时间内自动恢复，只需要重试几次就能调用成功。但是，有些问题需要很长时间来恢复时，不断重试显然不是一个很好的解决方案。相反，应用程序应该迅速接受这次操作失败，并进行相应的错误处理。

此外，如果一个服务非常繁忙，系统的一个部分的故障可能会导致级联故障。例如，服务调用方设置了调用的超时时间，如果服务在这段时间内没有返回响应，调用方直接用错误消息进行回复。这种策略可能会导致许多同一操作的并发请求被阻塞，直到超时。这些被阻塞的请求会占用着大量的系统资源（内存，线程，数据库连接等），这些资源耗尽，导致系统中需要使用相同资源的其他服务出现故障。在这种情况下，最好是**立即**让调用失败，只有在可能成功时才尝试调用服务。

<!-- more -->

{% note warning %}
设置一个更短的超时可能有助于解决这个问题，但是超时不应该太短，这可能会让那些本来应该成功的请求也超时。
{% endnote %}

## 解决

熔断器作为一个可能失败操作的代理，监控最近发生故障的数量，然后使用这些信息来决定是否允许操作继续，防止应用程序反复执行失败操作。

熔断器本质上就是一个**状态机**，它具有以下状态：

- **Closed：**程序可以正常发出请求，熔断器维护最近失败的次数，如果操作调用不成功，则熔断器增加此计数。如果在给定时间内，失败次数超过了指定的阈值，状态机将变为 **Open** 状态。此时，启动一个计时器，在一定时间后，状态机变为 **Half-Open** 状态。
- **Open：**程序发出的请求会立即失败，并向程序返回异常。（相当于电闸跳闸了）
- **Half-Open：**程序只能执行有限数量的请求操作，如果这些请求成功了（故障已经恢复），状态机变为 **Closed** 状态。如果请求失败了，状态机变为 **Open** 状态，并且重新启动计时器。

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202111161309094.png)

## Golang 实现

[![gobreaker](https://github-readme-stats.vercel.app/api/pin/?username=sony&repo=gobreaker&show_owner=true)](https://github.com/sony/gobreaker)

### 使用

我们可以通过 `Settings` 结构体配置熔断器：

```go
type Settings struct {
    Name          string
    MaxRequests   uint32
    Interval      time.Duration
    Timeout       time.Duration
    ReadyToTrip   func(counts Counts) bool
    OnStateChange func(name string, from State, to State)
}
```

- `MaxRequests`: **Half-Open** 状态下的最大请求次数，默认为 1
- `Interval`: **Closed** 状态下清空计数器的周期，默认不清空
- `Timeout`: **Open** 状态转 **Half-Open** 状态的时间，默认 60 秒
- `ReadyToTrip`: 通过计数器的信息判断是否需要熔断，默认连续失败 5 次后熔断
- `OnStateChange`: 状态变化时的回调

```go
package main

import (
    "errors"
    "log"
    "math/rand"
    "time"

    "github.com/sony/gobreaker"
)

func main() {
    rand.Seed(time.Now().UnixNano())

    cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
            // 失败率大于 60% 时熔断
            return counts.Requests >= 3 && failureRatio >= 0.6
        },
        OnStateChange: func(_ string, from, to gobreaker.State) {
            log.Printf("from: %v, to: %v\n", from, to)
        },
    })

    for {
        result, err := cb.Execute(func() (interface{}, error) {
            // 模拟 70% 的失败率
            if rand.Float64() < 0.7 {
                return nil, errors.New("some error")
            }
            return "ok", nil
        })
        log.Printf("result: %v, err: %v\n", result, err)
        time.Sleep(time.Second)
    }
}
```

运行结果：

```bash
$ go run main.go
2021/09/16 15:23:24 result: <nil>, err: some error
2021/09/16 15:23:25 result: <nil>, err: some error
2021/09/16 15:23:26 from: closed, to: open
2021/09/16 15:23:26 result: <nil>, err: some error
2021/09/16 15:23:27 result: <nil>, err: circuit breaker is open
2021/09/16 15:23:28 result: <nil>, err: circuit breaker is open
2021/09/16 15:23:29 result: <nil>, err: circuit breaker is open
2021/09/16 15:23:30 result: <nil>, err: circuit breaker is open
......
```

### Execute 流程

简单过一遍 `Execute()` 的流程，详细代码可以看 [gobreader.go](https://github.com/sony/gobreaker/blob/master/gobreaker.go)，不到 400 行，实现的非常简洁。

```go
func (cb *CircuitBreaker) Execute(req func() (interface{}, error)) (interface{}, error) {
    // 增加计数，判断状态
    generation, err := cb.beforeRequest()
    if err != nil {
        // 如果熔断器已经 Open，在这里就会直接返回 ErrOpenState
        // Half-Open 状态下超过最大请求数则返回 ErrTooManyRequests
        return nil, err
    }

    defer func() {
        e := recover()
        if e != nil {
            cb.afterRequest(generation, false)
            panic(e)
        }
    }()

    // 执行真正的操作
    result, err := req()

    // 增加计数，达到阈值就熔断，err 非空表示失败
    cb.afterRequest(generation, err == nil)
    return result, err
}
```

从上面的源码，我们可以看出，执行过程只是简单地通过 `err == nil` 判断成功，假设业务的逻辑很复杂，需要加入自定义的判断，可以用 `TwoStepCircuitBreaker`。

### 两阶段熔断

和普通熔断器的使用差不多，`Allow()` 方法只是调用了 `beforeRequest()`，然后返回回调函数 `done(success bool)` 和错误信息，通过回调函数我们能把操作成功与否告诉熔断器。

```go
package main

import (
    "log"
    "math/rand"
    "time"

    "github.com/sony/gobreaker"
)

func main() {
    rand.Seed(time.Now().UnixNano())

    cb := gobreaker.NewTwoStepCircuitBreaker(gobreaker.Settings{
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
            return counts.Requests >= 3 && failureRatio >= 0.6
        },
        OnStateChange: func(_ string, from, to gobreaker.State) {
            log.Printf("from: %v, to: %v\n", from, to)
        },
    })

    for {
        time.Sleep(time.Second)
        done, err := cb.Allow()
        if err != nil {
            log.Printf("err: %v\n", err)
            continue
        }
        success := true
        if rand.Float64() < 0.7 {
            log.Println("failure")
            success = false
        } else {
            log.Println("success")
        }
        done(success)
    }
}
```

运行结果：

```bash
$ go run main.go
2021/09/16 16:26:49 failure
2021/09/16 16:26:50 failure
2021/09/16 16:26:51 success
2021/09/16 16:26:52 failure
2021/09/16 16:26:52 from: closed, to: open
2021/09/16 16:26:53 err: circuit breaker is open
2021/09/16 16:26:54 err: circuit breaker is open
2021/09/16 16:26:55 err: circuit breaker is open
......
```

## 参考

- [Circuit Breaker Pattern](<https://docs.microsoft.com/en-us/previous-versions/msp-n-p/dn589784(v=pandp.10)>)
- [gobreaker](https://github.com/sony/gobreaker)
