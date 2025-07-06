---
title: 函数式编程
pubDate: 2023-07-21T16:20:42+08:00
tags:
  - ocaml
  - immutable
  - adt
  - currying
toc: true
description: '探讨函数式编程的核心概念，包括不可变性、代数数据类型和柯里化。'
---

前段时间学了 Rust 之后，感觉在 Rust 的类型系统加持下，函数式编程体验真的很爽。

- `Option` 配合各种 `map_or`， `map_or_else`, `unwrap_or` ... 来处理空值
- 表达式作为值（返回值、变量赋值）
- iter 配合一堆工具函数 `map`, `filter`, `reduce` ... 和 closures
- ...

为了了解一下纯粹的函数式编程究竟是什么样的，挑来挑去还是决定看一遍 cs3110，通过 OCaml 系统学习一下函数式编程。（为什么不是 Haskell？因为它看起来有点难，所以最后选了同样强类型的 OCaml）

> 引用 cs3110 第一课简介中的一句话：**learn how to program better.**
>
> 学习函数式编程的目的可能并不是未来在工作中使用它，但是通过学习函数式编程一定能教会你如何编写跟好的程序

<!-- more -->

## 难点

如果已经习惯了命令式编程，再学习函数式，肯定会遇到很多不习惯的特性：

- 变量不可变
- 没有 return
- 没有循环 (`for`, `while`)
- ...
- Erlang 甚至不能自定义类型（可以通过 `tuple` + `atom` 模拟结构体）

## 函数式编程

cs3110 还没学完，简单列举几个我学到现在，觉得非常有参考价值的函数式编程特性（不一定是函数式编程独有的）。

### Immutable

如果问小学生，怎么表达一个函数，实现对 x 加 1 的操作，他大概率会这么写：

$$
f(x) = x + 1
$$

可以得到：

- `f(1) = 1 + 1 = 2`
- `f(2) = 2 + 1 = 3`
- ...

但是问一个资深的 Python 研发（开个玩笑，其他命令式编程语言也差不多），他可能会说：“这需要函数吗，不就是一个赋值就搞定了？”

```py
x = x + 1
```

但是这个表达式给不熟悉编程的人看，他们的想法可能是：“x 都加 1 了怎么还会等于 x？难道 1 加 1 等于 1？”

**大多数人并不会想到，x 是个变量，x 是可变的，**这有些反直觉。

另外，可变变量在并发编程中，也会引出并发读写问题，我们通常需要通过上锁，或者原子操作去解决。

在大多数函数式编程中，变量都是不可变的，它只是某个值的名称而已：

单个数值：

```ocaml
let x = 3110
(* val x : int = 3 *)

x = x + 1 (* 等号是判断，不是赋值 *)
(* - : bool = false *)

x = 3110
(* - : bool = true *)

(* 变量覆盖(variable shadowing)，看起来很像修改了变量的值，其实只是不同作用域下完全不同的两个变量 *)
let x = 5 in
(let x = 6 in
 x)
+ x
(* - : int = 11 *)

(* 用变量覆盖和 x, y 两个变量的效果是一样的 *)
let x = 5 in
(let y = 6 in
 y)
+ x
(* - : int = 11 *)
```

链表（其他复杂数据结构也同理）：

```ocaml
let x = [1; 2; 3]
(* val x : int list = [1; 2; 3] *)

(* 由于不可变的特性，要修改第一个元素，必须造一个新的节点，插到链表的开头 *)
let modify_first = function
  | [] -> []
  | _ :: tail -> 0 :: tail
;;

modify_first x
(* - : int list = [0; 2; 3] *)
```

好。。。把这个思想应用到 Go，碰巧最近看到了一个并发 map 的[例子](https://pkg.go.dev/sync/atomic#example-Value-ReadMostly)：

这种实现的 map 是不可变的（不可变、只读，自然就是并发安全的），更新操作必须 clone 一个全新的 map，好处就是读操作**永远**不会被阻塞

```go
type Map map[string]string
var m atomic.Value
m.Store(make(Map))
var mu sync.Mutex // used only by writers
// read function can be used to read the data without further synchronization
read := func(key string) (val string) {
  m1 := m.Load().(Map)
  return m1[key]
}
// insert function can be used to update the data without further synchronization
insert := func(key, val string) {
  mu.Lock() // synchronize with other potential writers
  defer mu.Unlock()
  m1 := m.Load().(Map) // load current value of the data structure
  m2 := make(Map)      // create a new value
  for k, v := range m1 {
    m2[k] = v // copy all data from the current object to the new one
  }
  m2[key] = val // do the update that we need
  m.Store(m2)   // atomically replace the current object with the new one
  // At this point all new readers start working with the new version.
  // The old version will be garbage collected once the existing readers
  // (if any) are done with it.
}
_, _ = read, insert
```

{% note warning %}
这个并发 map 实现只适合 **读远大于多** 的场景，注意是 **远大于**，不是大于

例：从远端获取一些配置，这些配置很少更新，但是会经常读取
{% endnote %}

### ADT

代数数据类型 (algebraic data type)，有点像 Rust 里的 enum（或者说 Rust 就是从这里抄的，大概因为 Rust 的作者是 OCaml 的狂热粉丝吧）

以最经典的 `option` 为例：

```ocaml
type 'a option =
  | None
  | Some of 'a
```

它是用来取代某些语言里的 `null`, `undefined`, `nil` ... 适合用来表示一些不存在的，空的值。

例如 OCaml 标准库的 `List.hd` 是这样实现的：

```ocaml
(** Return the first element of the given list.
   @raise Failure if the list is empty.
 *)
let hd = function
    [] -> failwith "hd"
  | a::_ -> a
```

如果 list 为空，它会抛出一个异常，我们用 `option` 改造一下它：

```ocaml
let hd = function
  | [] -> None
  | a :: _ -> Some a
;;

hd []
(* - : 'a option = None *)

hd [1; 2; 3]
(* - : int option = Some 1 *)
```

要使用被包在 `option` 里的值，必须进行一次 pattern matching，没有任何办法可以**直接**从 `option` 里把值取出来

```ocaml
match hd [] with
| None -> "empty list !!!"
| Some i -> string_of_int i
```

### Pattern matching

无需多说，可以直接看 [Wikipedia](https://en.wikipedia.org/wiki/Pattern_matching) 或者 Rust 的相关语法，可以理解成是 `if`, `else`, `switch` 的超级加强版

### 柯里化

一开始学 OCaml 时，我就特别疑惑，为什么函数的类型定义看着像个链表，也没有明显区分出哪部分是参数，哪部分是返回值：

```ocaml
(* 比如 int 加法，接收两个 int，返回它们相加的结果 *)
Stdlib.( + );;
(* - : int -> int -> int = <fun> *)
```

在其他语言中，同样的函数可能是这样定义的：`(int, int) -> int`，而 OCaml 中是 `int -> int -> int`

直到学习了柯里化 (currying)，一切就都解释得通了。首先，函数参数可以只传一部分，或者说其实所有的函数，都只有一个参数：

```ocaml
let add3 = (( + ) 3);;
(* val add3 : int -> int = <fun> *)

add3 2;;
(* - : int = 5 *)
```

得到一个新的函数 `add3`，不难发现函数的定义是右结合的，每给一个参数，就返回一个新的函数：

- `int -> int -> int -> int`
- `int -> (int -> (int -> int))`

实际使用中，可以利用柯里化，对简单函数进行组合，实现复杂功能，例如实现 list 求和：

```ocaml
let sum = List.fold_left ( + ) 0
(* val sum : int list -> int = <fun> *)

sum [1; 2; 3]
(* - : int = 6 *)
```

## 最后

这几天，参考 [Caltech 的课程](http://courses.cms.caltech.edu/cs11/material/ocaml/lab5/lab5.html)。用 OCaml 写了个小玩具，一个简易的 Scheme 解释器，支持了尾递归优化和宏（水平有限，宏实现得比较烂）

[![bogoscheme](https://github-readme-stats.vercel.app/api/pin/?username=maolonglong&repo=bogoscheme&show_owner=true)](https://github.com/maolonglong/bogoscheme)
