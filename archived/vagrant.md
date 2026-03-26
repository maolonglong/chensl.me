---
title: 使用 Vagrant 搭建开发环境
date: 2021-10-12T16:02:32+08:00
tags:
  - virtualization
toc: true
description: 本文介绍了如何使用 Vagrant 快速搭建一次性开发环境，包括常用命令、box 的使用、Vagrantfile 配置以及更复杂的配置示例。
---

其实在学校的时候就开始轻度使用 Vagrant，但也仅仅作为一个虚拟机创建或者开关机的工具。来了公司实习后发现 Vagrant 在搭建**一次性**使用的开发环境时真的非常非常方便

<!-- more -->

## 需要安装的工具

- [VirtualBox](https://www.virtualbox.org/)
- [Vagrant](https://www.vagrantup.com/)

## 入门

> 更具体的推荐看[官方文档](https://www.vagrantup.com/docs)

常用命令：

```bash
vagrant init bento/ubuntu-18.04 # 创建配置文件并指定 box
vagrant up                      # 开机
vagrant reload                  # 重启（重新加载配置）
vagrant halt                    # 关机
vagrant destroy                 # 销毁虚拟机
vagrant box list                # 显示已下载的 box

vagrant suspend                 # 暂停
vagrant resume                  # 恢复

# 添加 box，具体看 vagrant box add -h
vagrant box add [options] <name, url, or path>
vagrant box remove <name> # 删除 box
```

### box

按照传统方法，装一台虚拟机，必须去某个 Linux 发行版的官网上下载 ISO 文件，然后打开 VMware 或者 VirtualBox，使用 ISO 一步一步创建虚拟机。而 Vagrant 提供了更简单的形式，一条命令就能从 box 创建并启动虚拟机

可以在官网[搜索](https://app.vagrantup.com/boxes/search)现成的 box

### Vagrantfile

相当于虚拟机的配置文件，可以配置网络、内存、CPU、同步文件夹、端口映射等，使用 `vagrant init` 在当前目录创建配置模板

一个最简单的配置文件就是仅指定 box，其他默认：

```rb title="Vagrantfile"
Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-18.04"
end
```

接着 `vagrant up` 读取配置文件并运行虚拟机，然后就可以去泡杯咖啡，其他什么也不用管，一切交给 vagrant（前提是网络环境好的情况下，懂得都懂，怎么保证访问外网的速度 🧱），当不再需要的时候运行 `vagrant destroy` 销毁即可。

## 更复杂的配置

以最近自己用的 golang + docker 环境为例，其实主要部分就是一个 shell 脚本，然后配置了私有网络，修改硬件为 1 CPU 2G 内存

shell 脚本默认情况下只会在第一次 `vagrant up` 的时候执行

```rb title="Vagrantfile"
# -*- mode: ruby -*-
# vi: set ft=ruby :

$script = <<-'SCRIPT'
echo "Setting timezone to Asia/Shanghai..."
sudo ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
echo "Asia/Shanghai" | sudo tee /etc/timezone
date

echo "Using Aliyun mirrors..."
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
sudo apt-get update
# Comment apt upgrade to make vagrant up faster
# sudo apt-get -y upgrade

echo "Installing Docker..."
sudo apt-get remove docker docker-engine docker.io
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

echo "Installing Golang..."
GO_VERSION=1.17.2
curl -sSL https://gomirrors.org/dl/go/go${GO_VERSION}.linux-amd64.tar.gz -o /tmp/go.tgz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
tee -a /home/vagrant/.profile <<-'EOF'
export GOROOT=/usr/local/go
export GOPATH=/home/vagrant/go
export PATH=$PATH:$GOROOT/bin:$GOPATH/bin
EOF
source /home/vagrant/.profile
go version
go env -w GO111MODULE=on
go env -w GOPROXY=https://goproxy.cn,https://goproxy.io,direct
mkdir -p /home/vagrant/go/{bin,pkg,src}
SCRIPT

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-18.04"
  config.vm.network "private_network", ip: "192.168.33.11"

  config.vm.provider "virtualbox" do |vb|
    vb.cpus = "1"
    vb.memory = "2048"
  end

  config.vm.provision "shell", inline: $script, privileged: false
end
```
