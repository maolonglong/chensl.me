---
title: 堆叠文件系统 OverlayFS
date: 2021-10-24 13:12:42
categories: 云计算
tags:
  - Linux
  - Docker
  - OverlayFS
  - chroot
---

因为工作需求，所以花时间了解了一下 OverlayFS。第一次知道这个概念，是使用 Docker 时，它默认使用的 Graph Driver 是 Overlay2，容器的 rootfs 就是直接以目录的形式在宿主机上组织。

<!-- more -->

## 参考资料

- [深入理解 overlayfs](https://blog.csdn.net/qq_15770331/article/details/96699386)
- [Linux Kernel documentation](https://www.kernel.org/doc/html/latest/filesystems/overlayfs.html)

## 环境准备

- VirtualBox
- Vagrant

用 vagrant 跑一个带有 docker 的虚拟机：

```rb Vagrantfile
# -*- mode: ruby -*-
# vi: set ft=ruby :

$script = <<-'SCRIPT'
sudo tee /etc/apt/sources.list <<-'EOF'
deb http://mirrors.aliyun.com/ubuntu/ bionic main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ bionic main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ bionic-security main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ bionic-security main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ bionic-updates main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ bionic-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ bionic-proposed main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ bionic-proposed main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ bionic-backports main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ bionic-backports main restricted universe multiverse
EOF
sudo apt-get -y update

sudo apt-get -y install apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable"
sudo apt-get -y update
sudo apt-get -y install docker-ce
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn/"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
sudo systemctl enable docker
# Make sure we can actually use docker as the vagrant user
sudo usermod -aG docker vagrant
sudo docker --version

sudo apt-get -y install bash-completion tree
SCRIPT

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-18.04"
  config.vm.synced_folder ".", "/vagrant", disabled: true

  config.vm.provision "shell", inline: $script, privileged: false
end
```

## 初步认识

随便拉一个镜像：

```text
vagrant@vagrant:~$ docker pull alpine
Using default tag: latest
latest: Pulling from library/alpine
a0d0a0d46f8b: Pull complete
Digest: sha256:e1c082e3d3c45cccac829840a25941e679c25d438cc8412c2fa221cf1a824e6a
Status: Downloaded newer image for alpine:latest
docker.io/library/alpine:latest
```

这时，我们就能在磁盘上找到对应的目录结构：

```text
vagrant@vagrant:~$ sudo su

root@vagrant:/home/vagrant# cd /var/lib/docker/overlay2/

root@vagrant:/var/lib/docker/overlay2# ls
ae64cdecc41d55f445ce1bed819dd312459bc7f2a2ddc80df60c789a5e3b06dc  l

root@vagrant:/var/lib/docker/overlay2# ls ae64cdecc41d55f445ce1bed819dd312459bc7f2a2ddc80df60c789a5e3b06dc/diff/
bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

再开一个窗口，启动一个容器：

```text
vagrant@vagrant:~$ docker run --rm -it alpine sh
/ # ls
bin    etc    lib    mnt    proc   run    srv    tmp    var
dev    home   media  opt    root   sbin   sys    usr
```

宿主机上的 overlay2 目录多出了一些东西：

```text
root@vagrant:/var/lib/docker/overlay2# ls
7fca31029adbb299211e702a704981f8dcf7a437d6522b565de0b11c353c78e6       ae64cdecc41d55f445ce1bed819dd312459bc7f2a2ddc80df60c789a5e3b06dc
7fca31029adbb299211e702a704981f8dcf7a437d6522b565de0b11c353c78e6-init  l

root@vagrant:/var/lib/docker/overlay2# mount | grep overlay
overlay on /var/lib/docker/overlay2/7fca31029adbb299211e702a704981f8dcf7a437d6522b565de0b11c353c78e6/merged type overlay (rw,relatime,lowerdir=/var/lib/docker/overlay2/l/6ND2PL2RECUKJ3KFZYGPYCA564:/var/lib/docker/overlay2/l/FDPTXFIRIH3NAJ6N5KIKDUMC6O,upperdir=/var/lib/docker/overlay2/7fca31029adbb299211e702a704981f8dcf7a437d6522b565de0b11c353c78e6/diff,workdir=/var/lib/docker/overlay2/7fca31029adbb299211e702a704981f8dcf7a437d6522b565de0b11c353c78e6/work)

root@vagrant:/var/lib/docker/overlay2# ls 7fca31029adbb299211e702a704981f8dcf7a437d6522b565de0b11c353c78e6/merged/
bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

一个名为 `overlay` 的驱动挂载到了 `/var/lib/docker/overlay2/7fca3.../merged`，从挂载信息可以看出 merged 目录是由多个目录联合挂载而成，lowerdir 为只读层 (ro)，upperdir 为可读可写层 (rw)，当需要修改 lowerdir 中的文件时，fs 会采用**写时复制**的策略，将文件从 lowerdir 复制到 upperdir 进行修改。在 merged 目录中（或者说在 docker 容器中）是感知不到这些复杂逻辑的，和操作正常目录没有区别

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202111161306717.jpeg)

## 实践

大概了解了 OverlayFS 之后，我们抛开 Docker 仅仅用 Linux 命令行就能模拟出一个简单的容器（注意只是简单模拟，几乎谈不上什么隔离性）

在开始前可以切换到 root，免得不必要的麻烦

```bash
sudo su
```

### 制作基础 rootfs

最后利用一下 Docker，导出一个 alpine 的 rootfs：

```bash
mkdir rootfs && docker export $(docker create alpine) | tar -C rootfs -xvf -
```

### Lowerdirs

由于 lowerdir 可以配置多个，所以，我们可以利用这一特性对 rootfs 进行一些定制。

替换中科大源：

```bash
mkdir -p rootfs-init/etc/apk
cp rootfs/etc/apk/repositories rootfs-init/etc/apk/
sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' rootfs-init/etc/apk/repositories
```

配置 DNS：

```bash
echo 'nameserver 223.5.5.5' > rootfs-init/etc/resolv.conf
```

### 准备其他目录

创建 upperdir，workdir 和 merged

```bash
mkdir diff work merged
```

最终的目录结构：

```text
root@vagrant:~# tree -L 2
.
├── diff
├── merged
├── rootfs
│   ├── bin
│   ├── dev
│   ├── etc
│   ├── home
│   ├── lib
│   ├── media
│   ├── mnt
│   ├── opt
│   ├── proc
│   ├── root
│   ├── run
│   ├── sbin
│   ├── srv
│   ├── sys
│   ├── tmp
│   ├── usr
│   └── var
├── rootfs-init
│   └── etc
└── work

23 directories, 0 files
```

### 手动挂载

将准备好的目录挂在到 merged:

```bash
mount overlay -t overlay -o lowerdir=/root/rootfs-init:/root/rootfs,upperdir=/root/diff,workdir=/root/work /root/merged
```

### 使用容器

利用 chroot 改变根文件系统

```bash
cd merged
chroot $PWD apk update
chroot $PWD apk upgrade
chroot $PWD apk add gcc
chroot $PWD gcc -v
chroot $PWD apk add neofetch
chroot $PWD neofetch
```

至此，我们已经通过 OverlayFS 和 chroot 实现了一个简易的容器

```text
root@vagrant:~# tree -L 2
.
├── diff
│   ├── bin
│   ├── dev
│   ├── etc
│   ├── lib
│   ├── root
│   ├── usr
│   └── var
├── merged
│   ├── bin
│   ├── dev
│   ├── etc
│   ├── home
│   ├── lib
│   ├── media
│   ├── mnt
│   ├── opt
│   ├── proc
│   ├── root
│   ├── run
│   ├── sbin
│   ├── srv
│   ├── sys
│   ├── tmp
│   ├── usr
│   └── var
├── rootfs
│   ├── bin
│   ├── dev
│   ├── etc
│   ├── home
│   ├── lib
│   ├── media
│   ├── mnt
│   ├── opt
│   ├── proc
│   ├── root
│   ├── run
│   ├── sbin
│   ├── srv
│   ├── sys
│   ├── tmp
│   ├── usr
│   └── var
├── rootfs-init
│   └── etc
└── work
    └── work

48 directories, 0 files
```
