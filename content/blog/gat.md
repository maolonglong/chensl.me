---
title: Rust GAT
date: 2023-01-24 19:58:29
tags:
  - rust
  - generics
toc: true
---

习惯了 Go 里简单无脑的泛型后，理解 Rust 的泛型还是费了点时间，尤其 GAT (Generic Associated Types)，也可以叫作**泛型关联类型**。

<!-- more -->

## 什么是 GAT

引用官方博客的一段内容：

> ... allow you to define type, lifetime, or const generics on associated types. Like so:
>
> ```rust
> trait Foo {
>     type Bar<'a>;
> }
> ```

简单说就是能在关联类型上定义类型或生命周期。

假设现在需要实现一个 mutable 的滑动窗口迭代器，不用 GAT，只用标准库里的 `Iterator` 可能会这么写：

```rust
struct WindowsMut<'t, T> {
    slice: &'t mut [T],
    start: usize,
    window_size: usize,
}

impl<'t, T> Iterator for WindowsMut<'t, T> {
    type Item = &'t mut [T];

    fn next<'a>(&'a mut self) -> Option<Self::Item> {
        let retval = self.slice[self.start..].get_mut(..self.window_size)?;
        self.start += 1;
        Some(retval)
    }
}
```

编译器输出：

```plaintext
error: lifetime may not live long enough
   |
7  | impl<'t, T> Iterator for WindowsMut<'t, T> {
   |      -- lifetime `'t` defined here
...
10 |     fn next<'a>(&'a mut self) -> Option<Self::Item> {
   |             -- lifetime `'a` defined here
...
13 |         Some(retval)
   |         ^^^^^^^^^^^^ associated function was supposed to return data with lifetime `'t` but it is returning data with lifetime `'a`
   |
   = help: consider adding the following bound: `'a: 't`
```

预期返回的引用的生命周期是 `'t`，实际返回的 `retval` 的生命周期是 `'a`。但我们又不可能按照编译器提示添加 `'a: 't`。

`'t` 是 `WindowsMut` 的生命周期，`'a` 是 `&mut WindowsMut` 的生命周期。通常不会让 reference 的生命周期比 owned data 还长（即 `'a >= 't` 是不合理的）。

## 使用 GAT

要解决上面编译错误的问题，只能缩短返回的引用的生命周期，这时候就需要用到 GAT：

```rust
trait LendingIterator {
    type Item<'a>
    where
        Self: 'a;

    fn next<'a>(&'a mut self) -> Option<Self::Item<'a>>;
}

impl<'t, T> LendingIterator for WindowsMut<'t, T> {
    type Item<'a> = &'a mut [T] where Self: 'a;

    fn next<'a>(&'a mut self) -> Option<Self::Item<'a>> {
        let retval = self.slice[self.start..].get_mut(..self.window_size)?;
        self.start += 1;
        Some(retval)
    }
}
```

测试：

```rust
struct Wrapper<T>(T);

impl<T> Wrapper<&mut [T]> {
    fn windows_mut(&mut self, size: usize) -> WindowsMut<'_, T> {
        WindowsMut {
            slice: self.0,
            start: 0,
            window_size: size,
        }
    }
}

fn main() {
    let mut arr = [1, 2, 3];
    let mut w = Wrapper(&mut arr[..]);
    let mut iter = w.windows_mut(2);

    assert_eq!(format!("{:?}", iter.next()), "Some([1, 2])");
    assert_eq!(format!("{:?}", iter.next()), "Some([2, 3])");
    assert_eq!(format!("{:?}", iter.next()), "None");
}
```

## 参考

- [Rust 的 GAT 到底是什么 - 知乎](https://zhuanlan.zhihu.com/p/589347703)
- [Rust 中的 GAT 和高阶类型 - 知乎](https://zhuanlan.zhihu.com/p/580996117)
- [The push for GATs stabilization | Rust Blog](https://blog.rust-lang.org/2021/08/03/GATs-stabilization-push.html)
