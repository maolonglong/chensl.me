---
title: 【Java 并发】volatile 关键字基本理解与使用
date: 2020-11-24 16:15:22
categories: Java
tags:
  - 并发
---

## volatile 的三个特性

- 保证可见性
- **不保证原子性**
- 禁止指令重排

## 指令重排

### 什么是指令重排

处理器为了提高程序运行效率，可能会对输入代码进行优化，它不保证程序中各个语句的执行先后顺序同代码中的顺序一致，但是它会保证程序最终执行结果和代码顺序执行的结果是一致的。

<!-- more -->

可能发生重排的代码：（意思就是第二行代码可能会先执行，听起来是不是有点匪夷所思）

```java
a = 1;
b = 2;
```

一定不会重排的代码（因为第 2 行依赖第 1 行的结果）：

```java
a = 2;
b += a;
```

### 举栗子

观察下面这段代码的运行结果，假设没有重排，那么运行结果只有可能是以下 3 种：

- x = 1, y = 1（先执行了 `a = 1` , `b = 1` 再执行 `x = b` 和 `y = a`）
- x = 0, y = 1（先执行了 `a = 1` , `x = b` 再执行 `b = 1` 和 `y = a`）
- x = 1, y = 0（先执行了 `b = 1` , `y = a` 再执行 `a = 1` 和 `x = b`）

```java
public class Main {

    private static int x;
    private static int y;
    private static int a;
    private static int b;

    public static void main(String[] args) throws InterruptedException {
        for (int i = 0; i < Integer.MAX_VALUE; i++) {
            x = y = a = b = 0;

            Thread t1 = new Thread(() -> {
                a = 1;
                x = b;
            });

            Thread t2 = new Thread(() -> {
                b = 1;
                y = a;
            });

            t1.start();
            t2.start();
            t1.join();
            t2.join();

            System.out.println("i = " + i + ", x = " + x + ", y = " + y);
            if (x == 0 && y == 0) {
                break;
            }
        }
    }
}
```

大概在运行几万次后会出现指令重排的现象，先执行了 `x = b` , `y = a` 再执行 `a = 1` 和 `b = 1`。结果就是 x 和 y 都等于 0。

**解决办法**：给四个变量加上 `volatile` 关键字，就不会出现预期之外的重排了。

## 可见性

首先看一段代码：

```java
public class Main {
    private static boolean flag = true;

    public static void main(String[] args) {
        new Thread(() -> {
            while (flag) {
            }
        }).start();
        flag = false;
    }

}
```

执行结果应该是符合我们预期的，由于主线程修改 `flag = false` ，所以终止了另一个线程中的死循环。

但是如果在 `flag = false` 前，让主线程睡一会：

```java
public class Main {
    private static boolean flag = true;

    public static void main(String[] args) throws InterruptedException {
        new Thread(() -> {
            while (flag) {
            }
        }).start();
        Thread.sleep(1000);
        flag = false;
    }

}
```

结果发现程序无法停止（依然处于死循环），这就体现了可见性的问题。每一个线程都会从**主存**中拷贝一份 `flag` 的副本到自己的**工作内存**，主线程中修改 `flag` 相当于修改了副本的值，然后再把副本的值刷到主存中。但是这个时候另一个线程并不知道主存中发生了什么变动， `while (flag)` 使用的依然是之前旧的副本，所以就导致了死循环，程序无法退出。（第一个例子是因为主线程跑得太快，在另一个线程开始从主存拷贝 `flag` 之前就已经把 `flag = false` 刷到主存里了）

加上 `volatile` 关键字后：

```java
public class Main {
    private volatile static boolean flag = true;

    public static void main(String[] args) throws InterruptedException {
        new Thread(() -> {
            while (flag) {
            }
        }).start();
        Thread.sleep(1000);
        flag = false;
    }

}
```

程序成功退出。原因是主线程把 `flag` 刷到主存的同时会使其他线程的 `flag` 副本失效，下一次再判断 `while (flag)` 的时候就会重新从主存读取。
