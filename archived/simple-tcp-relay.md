---
title: 用 Rust 实现一个简单的 TCP relay
date: 2023-03-06T12:59:24+08:00
tags:
  - rust
  - async
toc: true
description: 本文介绍了如何使用 Rust 和 Tokio 实现一个简单的 TCP relay，包括基础实现、错误处理、日志记录和优雅关闭功能。
---

[完整代码](https://github.com/maolonglong/tproxy)

```mermaid
flowchart LR
    Client-- inbound -->Relay
    Relay-- outbound -->Server
    Server-->Relay
    Relay-->Client
```

最近刚把 Rust 语法和常用功能过了一遍，刚好写一个简单的 TCP relay 练练手。因为 eBPF 看起来好像有点难，还没咋学，就先实现一个用户态 copy 的版本。

<!-- more -->

## 初始化项目

```bash
cargo new tproxy
cd tproxy
```

### 依赖

异步运行时使用 tokio（直接站在巨人的肩膀上。。。对我这种菜鸡来说，Rust 大概是写出高性能程序的唯一方式，CPP 简直不是人学的）

```toml title="Cargo.toml" ins={2-3}
[dependencies]
anyhow = "1.0"
tokio = { version = "1", features = ["full"] }
```

### Echo Server

先尝试跑通 echo serve，这应该能算是网络编程的 hello world 了吧 😂：

```rust title="src/main.rs"
use anyhow::Result;
use tokio::io;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:6101").await?;

    println!("accepting inbound connections");

    loop {
        let (mut inbound, _) = listener.accept().await?;

        // 几乎和 Golang 里 go func() 一样简单
        tokio::spawn(async move {
            let (mut r, mut w) = inbound.split();
            let _ = io::copy(&mut r, &mut w).await;
        });
    }
}
```

注意 `tokio::net::TcpListener` 不要导成 `std::net::TcpListener`，错误处理先用 anyhow 一股脑往外抛。最后就是每来一个连接，都启一个 async task 处理，因为是 echo server，所以就只需要把连接里读到的内容原样返回。

```bash
# 运行
cargo run

# 另起一个终端，用 telnet 测试
$ telnet 127.0.0.1 6101
Trying 127.0.0.1...
Connected to 127.0.0.1.
Escape character is '^]'.
hello
hello
world
world
```

## 最基础实现

有了上面 echo server 的例子，继续实现 relay 就非常简单了：

- echo server 中包含两个方向的数据复制：
  - inbound connection -> 用户程序
  - inbound connection <- 用户程序
- 参考文章最开始的图，为了实现 relay，我们需要四个方向的数据复制：
  - inbound connection -> 用户程序
  - 用户程序 -> outbound connection
  - 用户程序 <- outbound connection
  - inbound connection <- 用户程序

```rust title="src/main.rs"
use anyhow::Result;
use tokio::io::{self, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[tokio::main]
async fn main() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:6101").await?;

    println!("accepting inbound connections");

    loop {
        let (mut inbound, _) = listener.accept().await?;
        tokio::spawn(async move {
            // 这里连接的 127.0.0.1:8888 可以是任何基于 TCP 的服务
            // 我用了 Golang 跑的 HTTP 服务，还可以尝试连接 MySQL 或者 Redis...
            let mut outbound = TcpStream::connect("127.0.0.1:8888").await?;

            let (mut ri, mut wi) = inbound.split();
            let (mut ro, mut wo) = outbound.split();

            let client_to_server = async {
                io::copy(&mut ri, &mut wo).await?;
                wo.shutdown().await
            };

            let server_to_client = async {
                io::copy(&mut ro, &mut wi).await?;
                wi.shutdown().await
            };

            // try_join 等待任意一个 future 结束
            tokio::try_join!(client_to_server, server_to_client)?;

            Ok::<_, anyhow::Error>(())
        });
    }
}
```

<details>
  <summary>Golang HTTP server code</summary>

```go title="main.go"
package main

import (
	"fmt"
	"net/http"
	"time"
)

func greet(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello World! %s", time.Now())
}

// go run main.go
func main() {
	http.HandleFunc("/", greet)
	http.ListenAndServe(":8888", nil)
}
```

</details>

测试 relay 效果：

```bash
# 运行
cargo run

# Rust TCP relay
$ curl http://127.0.0.1:6101
Hello World! 2023-03-12 16:36:31.084117 +0800 CST m=+1890.305817001

# Golang HTTP server
$ curl http://127.0.0.1:8888
Hello World! 2023-03-12 16:36:35.356403 +0800 CST m=+1894.578158751
```

就这？？好了？是的。。。已经能跑了。但是这个程序还很脆弱，几乎没有错误处理，没有任何日志，也没有 graceful shutdown。

## 进一步完善

### 添加依赖

```toml title="Cargo.toml" ins={3-4, 6-7}
[dependencies]
anyhow = "1.0"
backon = "0.4"
clap = { version = "4.1.8", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

### 整理代码结构

把主要逻辑移到 `src/lib.rs`，单独处理 Listener 和 Handler，并且加上些日志和错误处理：

```rust title="src/main.rs"
use anyhow::Result;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    tproxy::run(
        TcpListener::bind("127.0.0.1:6101").await?,
        "127.0.0.1:8888".parse().unwrap(),
    )
    .await;

    Ok(())
}
```

```rust title="src/lib.rs"
use std::net::SocketAddr;

use anyhow::Result;
use tokio::io::{self, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info};

struct Listener {
    listener: TcpListener,

    // 目标服务的地址
    to_addr: SocketAddr,
}

struct Handler {
    inbound: TcpStream,
    outbound: TcpStream,
}

pub async fn run(listener: TcpListener, to_addr: SocketAddr) {
    let mut server = Listener { listener, to_addr };

    if let Err(err) = server.run().await {
        error!(cause = %err, "failed to accept");
    }
}

impl Listener {
    async fn run(&mut self) -> Result<()> {
        info!("accepting inbound connections");

        loop {
            let (inbound, addr) = self.listener.accept().await?;
            info!(?addr, "new connection");

            let outbound = TcpStream::connect(&self.to_addr).await;
            if let Err(err) = outbound {
                error!(cause = ?err, "connection error");
                continue;
            }

            let mut handler = Handler {
                inbound,
                outbound: outbound.unwrap(),
            };

            tokio::spawn(async move {
                match handler.run().await {
                    Ok(_) => {
                        info!(?addr, "connection closed");
                    }
                    Err(err) => {
                        error!(?addr, cause = ?err, "connection error");
                    }
                }
            });
        }
    }
}

impl Handler {
    async fn run(&mut self) -> Result<()> {
        let (mut ri, mut wi) = self.inbound.split();
        let (mut ro, mut wo) = self.outbound.split();

        let client_to_server = async {
            io::copy(&mut ri, &mut wo).await?;
            wo.shutdown().await
        };

        let server_to_client = async {
            io::copy(&mut ro, &mut wi).await?;
            wi.shutdown().await
        };

        tokio::try_join!(client_to_server, server_to_client)?;

        Ok(())
    }
}
```

### Graceful Shutdown

服务关闭前，最好等待正在处理的请求处理结束，等待时间过长再强行杀死，减少连接突然断开，给业务带来的影响。

在 Golang 中，可以用 `sync.WaitGroup` 或者靠 `close(channel)` 来通知，tokio 提供了和 channel **类似** 的 mpsc (multi-producer, single-consumer queue)。

实现思路：

1. Listener 和每个 Handler 都持有 `mpsc::Sender`
2. Listener 接收到 Ctrl-C 信号后，drop 掉自己的 sender，然后 **等待** `mpsc::Receiver` 返回
3. 所有 Handler 都处理完请求，drop 自己的 sender
4. Listener 等待 receiver 返回 `None`（所有 sender 都被 drop 后，返回的特殊值），完成 graceful shutdown。

```rust ins={4, 10}
struct Listener {
    listener: TcpListener,
    to_addr: SocketAddr,
    shutdown_complete_tx: mpsc::Sender<()>,
}

struct Handler {
    inbound: TcpStream,
    outbound: TcpStream,
    _shutdown_complete: mpsc::Sender<()>,
}
```

```rust title="src/lib.rs@run"
const GRACEFUL_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(15);

pub async fn run(listener: TcpListener, to_addr: SocketAddr, shutdown: impl Future) {
    let (shutdown_complete_tx, mut shutdown_complete_rx) = mpsc::channel(1);

    let mut server = Listener {
        listener,
        to_addr,
        shutdown_complete_tx,
    };

    tokio::select! {
        res = server.run() => {
            if let Err(err) = res {
                error!(cause = %err, "failed to accept");
            }
        }
        _ = shutdown => {
            info!("shutting down");
        }
    }

    let Listener {
        shutdown_complete_tx,
        ..
    } = server;

    drop(shutdown_complete_tx);

    if time::timeout(GRACEFUL_SHUTDOWN_TIMEOUT, shutdown_complete_rx.recv())
        .await
        .is_err()
    {
        warn!("graceful shutdown timeout");
    }
}
```

```rust title="src/lib.rs@impl Listener" ins={18}
impl Listener {
    async fn run(&mut self) -> Result<()> {
        info!("accepting inbound connections");

        loop {
            let (inbound, addr) = self.listener.accept().await?;
            info!(?addr, "new connection");

            let outbound = TcpStream::connect(&self.to_addr).await;
            if let Err(err) = outbound {
                error!(cause = ?err, "connection error");
                continue;
            }

            let mut handler = Handler {
                inbound,
                outbound: outbound.unwrap(),
                _shutdown_complete: self.shutdown_complete_tx.clone(),
            };

            tokio::spawn(async move {
                match handler.run().await {
                    Ok(_) => {
                        info!(?addr, "connection closed");
                    }
                    Err(err) => {
                        error!(?addr, cause = ?err, "connection error");
                    }
                }
            });
        }
    }
}
```

```rust title="src/main.rs" ins={3, 12}
use anyhow::Result;
use tokio::net::TcpListener;
use tokio::signal;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    tproxy::run(
        TcpListener::bind("127.0.0.1:6101").await?,
        "127.0.0.1:8888".parse().unwrap(),
        signal::ctrl_c(),
    )
    .await;

    Ok(())
}
```

### 从命令行参数解析配置

```rust title="src/main.rs"
use std::net::SocketAddr;

use anyhow::Result;
use clap::Parser;
use tokio::net::TcpListener;
use tokio::signal;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Listen address
    #[arg(short, long, default_value = "127.0.0.1:6101")]
    from: SocketAddr,

    /// Address which relay to, like: 1.2.3.4:9999
    #[arg(short, long)]
    to: SocketAddr,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    tproxy::run(
        TcpListener::bind(&args.from).await?,
        args.to,
        signal::ctrl_c(),
    )
    .await;

    Ok(())
}
```

clap 的 derive 宏，自动生成的 CLI：

```bash
$ cargo run -- --help
    Finished dev [unoptimized + debuginfo] target(s) in 0.07s
     Running `target/debug/tproxy --help`
Minimal TCP relay (proxy).

Usage: tproxy [OPTIONS] --to <TO>

Options:
  -f, --from <FROM>  Listen address [default: 127.0.0.1:6101]
  -t, --to <TO>      Address which relay to, like: 1.2.3.4:9999
  -h, --help         Print help
  -V, --version      Print version
```

### Accept 重试

最后一个可有可无的优化，仔细看 `Listener::run`，如果 `accept()` 失败了，整个程序就直接退出了，可以加上重试，增加些容错率。

```rust
impl Listener {
    async fn run(&mut self) -> Result<()> {
        ...

        loop {
            let (inbound, addr) = self.listener.accept().await?;
            ...
        }
    }
}
```

刚好前几天看了 [@Xuanwo](https://github.com/Xuanwo) 大佬介绍 Rust 错误重试库 [backon](https://github.com/Xuanwo/backon) 的 [文章](https://xuanwo.io/reports/2023-09/)，就拿来用了：

```rust del={11} ins={5-8, 12}
impl Listener {
    async fn run(&mut self) -> Result<()> {
        info!("accepting inbound connections");

        let accept = || async { self.listener.accept().await };
        let backoff_builder = ExponentialBuilder::default()
            .with_jitter()
            .with_max_times(64);

        loop {
            let (inbound, addr) = self.listener.accept().await?;
            let (inbound, addr) = accept.retry(&backoff_builder).await?;
            info!(?addr, "new connection");
            ...
        }
    }
}
```

## 完整代码

<https://github.com/maolonglong/tproxy>
