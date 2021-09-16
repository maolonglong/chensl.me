---
title: "Go 函数选项模式（Functional Options）"
categories:
  - Golang
tags:
  - 设计模式
excerpt_separator: "<!-- more -->"
---

在 Python 中经常可以看到这样的代码：

```py
def sub(x=3, y=1):
    return x - y


print(sub(3, 1))
print(sub(y=1, x=3))
print(sub())
```

函数可以设置参数默认值。并且调用时，能指定名称以自由调换参数位置。

go 中显然没有这样的语法糖，但是我们能通过**函数选项模式**实现类似的功能。

<!-- more -->

```go
package main

import "fmt"

// 将参数封装成结构体
type Args struct {
    StringArg string
    IntArg    int
}

// 参数默认值
var defaultArgs = Args{
    StringArg: "default string",
    IntArg:    666,
}

type Option func(p *Args)

func WithStringArg(s string) Option {
    return func(p *Args) {
        p.StringArg = s
    }
}

func WithIntArg(i int) Option {
    return func(p *Args) {
        p.IntArg = i
    }
}

func Method(opts ...Option) {
    args := defaultArgs
    for _, o := range opts {
        o(&args)
    }
    fmt.Printf("%#v\n", args)
}

func main() {
    // 全部使用默认值
    Method()

    // 全部指定
    Method(WithStringArg("hello"), WithIntArg(18))

    // 仅指定 int arg
    Method(WithIntArg(19))
}
```
