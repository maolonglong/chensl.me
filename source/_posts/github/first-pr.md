---
title: 开始第一个 Pull Request
date: 2021-09-18 15:52:39
categories: GitHub
tags:
  - LeetCode
---

git 几乎是所有程序员必须掌握的一个工具，但是始终在本地练习似乎发现不了它真正的强大，于是目光就转向了 GitHub 这个提供了仓库托管服务的网站。在 GitHub 上我们能利用 git 和世界各地的程序员协作开发，分享有趣的代码。

<!-- more -->

## Pull Request

> GitHub 简单的使用就不赘述了，这篇主要分享一下我是怎么从一个人默默玩“单机版 GitHub”，到第一次给别人的项目提交 pr

首先，什么是 pr (pull request) ？在本地使用 git 的时候，有一个 merge 功能，能够进行分支合并，pr 就是 GitHub 上的 merge，它增加了代码 review 和 CI/CD 等功能。通过 pr 我们可以给别人的项目新增功能、修复 bug，在项目维护者 review 完你的代码，通过并且合并了这次 pr，你就能成为这个项目的 contributor (贡献者)

## 我的第一次 PR

玩 GitHub 的程序员肯定多多少少希望自己的仓库能有很多 ⭐，我也不例外，但是无奈技术还没达到大佬的级别，写不出什么好的项目或者框架。一次逛 GitHub 发现别人整理的力扣热门问题的 Go 语言题解，获得了挺多星星，于是就想自己也整理一个 Java 版本的。但也是三分热度，写了几周就没坚持下去，后来偶然看到了[杨立滨](https://github.com/yanglbme)大佬维护的 [doocs/leetcode](https://github.com/doocs/leetcode)，被 README 里的[加入我们](https://github.com/doocs/leetcode#%E5%8A%A0%E5%85%A5%E6%88%91%E4%BB%AC)吸引到了：

![](https://cdn.jsdelivr.net/gh/MaoLongLong/images/202111161308204.png)

迈出第一步确实挺紧张，查了好多资料，然后照着 README 里的步骤打开了人生第一次 pr ([#359](https://github.com/doocs/leetcode/pull/359))，虽然有些错误，但是在大佬的指点下还是改正了过来，成功被合并。

## 注意事项

自己的一些小经验，一次规范的 pr 不仅减少了自己重复修改的次数，也方便了项目维护者 review

### 代码格式

可能每个人都有自己的编程习惯，左大括号换行或是不换行，2 空格缩进或是 4 空格缩进。自己敲代码的时候可以按习惯来，但是在提交前最好按照项目的标准格式化一遍（自己配置好格式化工具或者使用项目提供的格式化配置）

### 测试

项目有单元测试，修改了代码后，确保单元测试跑的通，不要提交一个显而易见的 bug。如果是文档类项目，最好在本地预览一遍（除非你很熟练，相信自己不会在 markdown 里都写出 bug）

### Commit Message

大部分项目对 commit message 会有一定要求，可以学习一下 Angular 的 [Commit Message Format](https://github.com/angular/angular/blob/12.2.6/CONTRIBUTING.md#commit)。另外可以使用 [cz-cli](https://github.com/commitizen/cz-cli) 很方便地写出规范的 commit message:

```bash
# 安装 cz-cli (前提得先装好 node.js)
npm i -g commitizen cz-conventional-changelog
echo '{ "path": "cz-conventional-changelog" }' > ~/.czrc

# 像往常一样 add 然后 commit (commit 改为 cz)
git add .
git cz
```

没人不喜欢这样清晰的 commits:

```bash
$ git log --oneline
007059963 (HEAD -> main, origin/main, origin/HEAD) feat: add solutions to lc/lcof2 problem: Asteroid Collision
92e73c337 chore: update contributors to @doocs/leetcode
8453df21d feat: add solutions to lc problem: No.0825.Friends Of Appropriate Ages
f8ea6eb9d feat: add solutions to lcof2 problem:No.075
362159f22 feat: add solutions to lc problems: No.0912,1122
89d6e7117 feat: add solutions to lc problem: No.1869.Longer Contiguous Segments of Ones than Zeros
b680b612c feat: add solutions to lc problem: No.1051.Height Checker
f4ccd19bd feat: add solutions to lc problem: No.0912.Sort an Array
2e803a22b feat: add solutions to lcof2 problem: No.046
6421c40d3 chore: update contributors to @doocs/leetcode
f41bad246 feat: add cpp solution to lcof2 problem: NO.046 (#567)
......
```

## 最后

打一波广告，欢迎喜欢刷题的小伙伴加入我们

[![leetcode](https://github-readme-stats.vercel.app/api/pin/?username=doocs&repo=leetcode&show_owner=true)](https://github.com/doocs/leetcode)
