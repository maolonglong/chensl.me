---
title: 【Java 并发】重入锁（ReentrantLock）
date: 2020-11-24 16:13:45
categories: Java
tags:
  - 并发
---

## 什么是“重入”

Re-Entrant-Lock 翻译成重入锁也是非常贴切的。之所以这么叫，那是因为这种锁是可以反复进入的。当然，这里的反复**仅仅局限于一个线程**，观察下面的代码， `f1` 锁住 `lock` 之后， `f2` 依然能继续获取到 `lock` 并执行，因为它们都属于主线程。

<!-- more -->

```java
public class Main {

    static class Test {
        private final ReentrantLock lock = new ReentrantLock();

        public void f1() {
            lock.lock();
            try {
                System.out.println(Thread.currentThread().getName());
                f2();
            } finally {
                lock.unlock();
            }
        }

        public void f2() {
            lock.lock();
            try {
                System.out.println(Thread.currentThread().getName());
            } finally {
                lock.unlock();
            }
        }
    }

    public static void main(String[] args) {
        Test test = new Test();
        test.f1();
    }
}
```

## 重入锁 VS synchronized

重入锁可以完全替代 `synchronized` 关键字。在 JDK 5.0 的早期版本中，重入锁的性能远远好于 `synchronized` ，但从 JDK 6.0 开始，JDK 在 `synchronized` 上做了大量的优化，使得两者的性能差距并不大。

用两种方法分别实现 `num++`：

### 重入锁

```java
public class Main {

    static int num = 0;
    static ReentrantLock lock = new ReentrantLock();

    public static void main(String[] args) throws InterruptedException {
        Thread[] ts = new Thread[32];
        Runnable runnable = () -> {
            for (int i = 0; i < 10000; i++) {
                lock.lock();
                try {
                    num++;
                } finally {
                    lock.unlock();
                }
            }
        };
        for (int i = 0; i < 32; i++) {
            ts[i] = new Thread(runnable);
            ts[i].start();
        }
        for (int i = 0; i < 32; i++) {
            ts[i].join();
        }
        System.out.println(num);
    }
}
```

### synchronized

```java
public class Main {

    static int num = 0;
    static Object obj = new Object();

    public static void main(String[] args) throws InterruptedException {
        Thread[] ts = new Thread[32];
        Runnable runnable = () -> {
            for (int i = 0; i < 10000; i++) {
                synchronized (obj) {
                    num++;
                }
            }
        };
        for (int i = 0; i < 32; i++) {
            ts[i] = new Thread(runnable);
            ts[i].start();
        }
        for (int i = 0; i < 32; i++) {
            ts[i].join();
        }
        System.out.println(num);
    }
}
```

## 响应中断

对于 `synchronized` 来说，如果一个线程在等待锁，那么结果只有两种情况，要么它获得这把锁继续执行，要么它就保持等待。而使用重入锁，则提供另外一种可能，那就是线程可以被中断。

模拟一个死锁的场景：两个线程都需要获取 `lock1`, `lock2` 两把锁，线程 `t1` 先获取了 `lock1` ，线程 `t2` 先获取了 `lock2` ，然后它们就开始无限等待对方让出锁。但是这个时候，如果中断了线程 `t2` ，并且释放 `t2` 占有的锁， `t1` 就能正常运行：

```java
public class Main {

    static class IntLock implements Runnable {
        private static ReentrantLock lock1 = new ReentrantLock();
        private static ReentrantLock lock2 = new ReentrantLock();
        private int lock;

        public IntLock(int lock) {
            this.lock = lock;
        }

        @Override
        public void run() {
            try {
                if (lock == 1) {
                    lock1.lockInterruptibly();
                    try {
                        Thread.sleep(500);
                        lock2.lockInterruptibly();
                        try {
                            System.out.println("t1成功获取两把锁");
                        } finally {
                            lock2.unlock();
                        }
                    } catch (InterruptedException e) {
                        System.out.println("t1被中断");
                        Thread.currentThread().interrupt();
                    } finally {
                        lock1.unlock();
                    }
                } else {
                    lock2.lockInterruptibly();
                    try {
                        Thread.sleep(500);
                        lock1.lockInterruptibly();
                        try {
                            System.out.println("t2成功获取两把锁");
                        } finally {
                            lock1.unlock();
                        }
                    } catch (InterruptedException e) {
                        System.out.println("t2被中断");
                        Thread.currentThread().interrupt();
                    } finally {
                        lock2.unlock();
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    public static void main(String[] args) throws InterruptedException {
        IntLock r1 = new IntLock(1);
        IntLock r2 = new IntLock(2);
        Thread t1 = new Thread(r1);
        Thread t2 = new Thread(r2);
        t1.start();
        t2.start();
        Thread.sleep(1000);
        t2.interrupt();
    }
}
```

## 锁申请等待限时

`tryLock()` 方法接收两个参数，一个表示等待时长，另外一个表示计时单位。也可以不带参数直接运行。在这种情况下，当前线程会尝试获得锁，如果锁并未被其他线程占用，则申请锁会成功，并立即返回 `true` 。如果锁被其他线程占用，则当前线程不会进行等待，而是立即返回 `false`。

```java
public class Main {

    private static ReentrantLock lock = new ReentrantLock();

    public static void main(String[] args) {
        Runnable target = () -> {
            try {
                if (lock.tryLock(1, TimeUnit.SECONDS)) {
                    System.out.println(Thread.currentThread().getName() + " get lock success");
                    Thread.sleep(4000);
                } else {
                    System.out.println(Thread.currentThread().getName() + " get lock failed");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
                }
            }
        };
        Thread t1 = new Thread(target);
        Thread t2 = new Thread(target);
        t1.start();
        t2.start();
    }

}
```

## 公平锁

在大多数情况下，锁的申请都是非公平的。也就是说，线程 1 首先请求了锁 A，接着线程 2 也请求了锁 A。那么当锁 A 可用时，是线程 1 可以获得锁还是线程 2 可以获得锁呢？这是不一定的。系统只是会从这个锁的等待队列中随机挑选一个。因此不能保证其公平性。这就好比买票不排队，大家都乱哄哄得围在售票窗口前，售票员忙得焦头烂额，也顾不及谁先谁后，随便找个人出票就完事了。而公平的锁，则不是这样，它会按照时间的先后顺序，保证先到者先得，后到者后得。公平锁的一大特点是：它不会产生饥饿现象。只要你排队，最终还是可以等到资源的。如果我们使用 synchronized 关键字进行锁控制，那么产生的锁就是非公平的。而重入锁允许我们对其公平性进行设置。它有一个如下的构造函数：

```java
public ReentrantLock(boolean fair)
```

当参数 fair 为 true 时，表示锁是公平的。公平锁看起来很优美，但是要实现公平锁必然要求系统维护一个**有序队列**，因此公平锁的实现成本比较高，性能相对也非常低下，因此，**默认情况下，锁是非公平的**。如果没有特别的需求，也不需要使用公平锁。公平锁和非公平锁在线程调度表现上也是非常不一样的。下面的代码可以很好地突出公平锁的特点：

```java
public class Main {

    private static ReentrantLock fairLock = new ReentrantLock(true);

    public static void main(String[] args) throws InterruptedException {
        Runnable target = () -> {
            while (!Thread.currentThread().isInterrupted()) {
                fairLock.lock();
                try {
                    System.out.println(Thread.currentThread().getName() + " 获得锁");
                } finally {
                    fairLock.unlock();
                }
            }
        };
        Thread t1 = new Thread(target);
        Thread t2 = new Thread(target);
        t1.start();
        t2.start();
        Thread.sleep(1000);
        t1.interrupt();
        t2.interrupt();
    }

}
```

从运行结果可以看出，大部分情况下，两个线程是交替运行的。

```text
...
Thread-0 获得锁
Thread-1 获得锁
Thread-0 获得锁
Thread-1 获得锁
Thread-0 获得锁
Thread-1 获得锁
Thread-0 获得锁
Thread-1 获得锁
Thread-0 获得锁
...
Thread-0 获得锁
Thread-1 获得锁
Thread-0 获得锁
Thread-1 获得锁
Thread-0 获得锁
...
```

但是换成非公平锁之后，会发现连续多次都是同一个线程获取锁。

```text
...
Thread-0 获得锁
Thread-0 获得锁
Thread-0 获得锁
Thread-0 获得锁
Thread-0 获得锁
Thread-0 获得锁
...
Thread-1 获得锁
Thread-1 获得锁
Thread-1 获得锁
Thread-1 获得锁
Thread-1 获得锁
Thread-1 获得锁
Thread-1 获得锁
...
```
