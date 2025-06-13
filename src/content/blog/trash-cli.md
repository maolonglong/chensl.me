+++
title = 'MacOS 上更安全的 rm'
pubDate = 2024-01-15T21:12:35+08:00
draft = false
tags = ['go', 'apple-script']
toc = true
+++

`rm` 命令应该是 Unix 系统最危险的命令，没有之一。用 `rm` 删除文件后很难恢复，尤其是大家经常拿来开玩笑骗小白的 `rm -rf /*`。

## 真那么危险吗？

(这部分的命令千万别复制执行！！！)

真的！就身边朋友遇到的，或者听说到的，主要有两类：

### 错误的环境变量

```bash
# 定义了某个环境变量
export foo=xxx

# 然后由于 typo，或者变量被 unset，最终引用了一个空的值
# 这条命令完全等价于 rm -rf /*
rm -rf ${bar}/*
```

### 空格

乱在网上复制代码直接执行特别容易踩这个坑，浏览器上不注意看，以为是 `/usr/local/bin/xxx`，复制一执行才发现是 `/usr` **和** `/local/bin/xxx`。

```bash
rm -rf /usr /local/bin/xxx
```

### 其他手滑操作

终端自动补全，还没看清补全了什么，就直接回车（我就干过，还是一个没用 git 管理的目录 😇）：

```bash
rm -rf <Tab><Tab><Enter>
```

## MacOS 的回收站

因为平常基本用的 MacOS，自然很容易想到，不使用 `rm` 真正删除文件，而是把文件往回收站丢不就好了？

思路很简单，但是 MacOS 的回收站目录 (`~/.Trash`) 有很奇怪的权限（没仔细研究过），似乎没办法直接用 `ls`, `cp`, `mv` 之类的操作：

```bash
$ ls
".": Operation not permitted (os error 1)

$ sudo ls
ls: cannot open directory '.': Operation not permitted
```

Google 了一波，发现可以用 AppleScript 实现类似 `mv file ~/.Trash/` 的操作:

```bash
# https://apple.stackexchange.com/a/310084
osascript -e "tell application \"Finder\" to delete POSIX file \"${PWD}/${InputFile}\""
```

## trash-cli

[完整代码](https://github.com/maolonglong/trash)

最后就是把它包装成一个好用的 CLI，保持了和 `rm` 差不多的选项，所以简单起见，可以直接 `alias rm=trash`。

```bash
$ go install github.com/maolonglong/trash@latest
...

$ trash --help
Usage: trash [OPTION]... [FILE]...
Move FILE(s) to the trash.

  -f, --force           ignore nonexistent files and arguments, never prompt
  -h, --help            display this help and exit
  -p, --protect paths   protected paths, separated by comma
  -r, --recursive       remove directories and their contents recursively

By default, trash does not remove directories.  Use the --recursive (-r)
option to remove each listed directory, too, along with all of its contents.

To remove a file whose name starts with a '-', for example '-foo',
use one of these commands:
  trash -- -foo

  trash ./-foo
```

注意有个 `protect` 参数（可以理解成是 deny list），分享下我自己的用法：

```bash
# 配置文件是可选的，位置也随意，甚至可以不需要配置文件，
# 不管什么方式，只要传了 protect 参数就行。
$ cat ~/.protected_paths
/
/bin
/boot
/dev
/etc
/home
/initrd
/lib
/lib32
/lib64
/proc
/root
/sbin
/sys
/usr
/usr/bin
/usr/include
/usr/lib
/usr/local
/usr/local/bin
/usr/local/include
/usr/local/sbin
/usr/local/share
/usr/sbin
/usr/share
/usr/src
/var

# 配置文件用换行方便编辑，传给 trash-cli 的时候用逗号拼接
$ cat ~/.protected_paths | awk 'BEGIN { ORS="," } { print $0 }' | sed 's/,$//'
/,/bin,/boot,/dev,/etc,/home,/initrd,/lib,/lib32,/lib64,/proc,/root,/sbin,/sys,/usr,/usr/bin,/usr/include,/usr/lib,/usr/local,/usr/local/bin,/usr/local/include,/usr/local/sbin,/usr/local/share,/usr/sbin,/usr/share,/usr/src,/var

# 可以把这行加到 ~/.zshrc 里，或者 ~/.bashrc 或者其他...
$ alias rm='trash --protect $(cat ~/.protected_paths | awk '\''BEGIN { ORS="," } { print $0 }'\'' | sed '\''s/,$//'\'') '
```

最终效果就是 回收站 + deny list 的**双重保护**，再误删就。。。有点过分了

```bash
$ rm -r /usr/local/bin
trash: skipping "/usr/local/bin"
```

> 配置了 alias 后，小心 `sudo rm`!!!
>
> 配置了 alias 后，小心 `sudo rm`!!!
>
> 配置了 alias 后，小心 `sudo rm`!!!
>
> `sudo` 相当于切换成 root，然后 root 又没有配置 alias，所以调用的是真正的 `rm`
