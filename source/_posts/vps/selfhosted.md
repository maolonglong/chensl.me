---
title: 1 核 1G 的 VPS 能玩出什么花样
date: 2022-03-27 14:25:47
categories: VPS
tags:
  - Vultr
  - PaaS
  - Heroku
  - Dokku
  - self-hosted
  - CapRover
---

最开始第一台阿里云服务器，在上面跑服务都是纯手工编译打包，上传到服务器，然后再用 `nohup`, `systemd` 之类的工具挂在后台。后来学了 Docker，再后来用一些 Docker 的图形界面（portainer）省去了 `ssh` 进服务器敲命令的过程。但是配置域名，依然需要折腾 nginx 或者 Caddy，如果是境内服务器还需要走麻烦的备案流程。所以，最近尝试了几个 PaaS 方案，它们通常能自动化编译、部署、配置域名反向代理、SSL 证书自动续期 ...

<!-- more -->

## 免备案

没有什么歪门邪道，如果嫌备案麻烦，就老老实实多花一点钱买个香港的机子（或者新加坡，日本，洛杉矶 ...），跑一些个人小项目足矣。它们不仅免备案，**而且**在使用大部分包管理工具的时候都可以直接用默认的源，👍 速度超赞

## CapRover

[CapRover](https://caprover.com/) 是 Heroku 的 self-hosted 替代方案，它完全开源，每月 5$ 的 1C1G 机子就可以运行

### 对比

其实 [Dokku](https://dokku.com/) 也挺不错，只是我更喜欢在 Web 界面上操作，`Dockerfile` 也能满足大部分应用的需求。最重要的是 CapRover 有一个叫 **One Click Apps** 的功能，能一键部署 Gitea, Gitlab, Drone, Wordpress, Ghost 等常见应用，😅 有点像宝塔，有一说一还挺香

|              CapRover               |      Dokku      |     Heroku      |
| :---------------------------------: | :-------------: | :-------------: |
|                便宜                 |      便宜       |       贵        |
| 只支持 Dockerfile 或 docker-compose | 各种 buildpacks | 各种 buildpacks |
|             有 Web 界面             |   ShellScript   |   有 Web 界面   |
|          基于 Docker Swarm          |   基于 Docker   |        -        |

### 安装

照着官网的 [Getting Started](https://caprover.com/docs/get-started.html) 慢慢做就行，注意得提前安装好 Docker：

```bash
curl -fsSL https://get.docker.com | sh
```

## Apps

我现在部署的一些 App：

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202203271825038.png)

### go-import-redirector

Golang 导包的重定向器，在[开源](https://github.com/rsc/go-import-redirector)的基础上做了点改造

能把 `go get` 从自定义域名重定向到 GitHub：

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202203271833111.png)

或者浏览器直接打开，跳转到 GoDoc：

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202203271830848.png)

### tinyurl

自己写的短链接工具，没啥高级功能，**能跑就行**

[t.chensl.me/lc1016](https://t.chensl.me/lc1016)

### Portainer

Docker 的 Web 界面，结合着 CapRover 用来管理容器

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202203271855823.png)

### Syncthing

一个去中心化的文件同步工具，经常需要用它和室友互传一些文件（😈 不可告人的文件）

### FileBrowser

结合 Syncthing 使用，在没有安装 Syncthing 的电脑上也能在线管理文件

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202203271901985.png)
