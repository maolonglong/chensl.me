---
title: 记录一次 Go Module 依赖关系的修复
date: 2022-12-17T16:55:34+08:00
tags:
  - go
description: '解决 Go Module 依赖冲突问题：通过模块替换修复因不同版本 antlr 依赖导致的编译错误。'
---

事情的起因：

```bash
$ go version
go version go1.17.13 darwin/arm64
$ go mod tidy
example.com/... imports
    example.com/... imports
    example.com/... imports
    ...
    example.com/... imports
    github.com/google/cel-go/cel imports
    github.com/google/cel-go/parser imports
    github.com/antlr/antlr4/runtime/Go/antlr loaded from github.com/antlr/antlr4/runtime/Go/antlr@v1.4.10,
    but go 1.16 would fail to locate it:
    ambiguous import: found package github.com/antlr/antlr4/runtime/Go/antlr in multiple modules:
    github.com/antlr/antlr4 v0.0.0-20200503195918-621b933c7a7f (/Users/xxx/go/pkg/mod/github.com/antlr/antlr4@v0.0.0-20200503195918-621b933c7a7f/runtime/Go/antlr)
    github.com/antlr/antlr4/runtime/Go/antlr v1.4.10 (/Users/xxx/go/pkg/mod/github.com/antlr/antlr4/runtime/!go/antlr@v1.4.10)

To proceed despite packages unresolved in go 1.16:
    go mod tidy -e
If reproducibility with go 1.16 is not needed:
    go mod tidy -compat=1.17
For other options, see:
    https://golang.org/doc/modules/pruning
```

<!-- more -->

> 这里的 _pruning_ 指的是 `go1.17` 的新特性 Module graph pruning（翻译成「模块裁剪」？），它会删除 `go.sum` 里一些不必要的 **间接依赖**，更详细的可以看 [官方文档](https://go.dev/ref/mod#graph-pruning)。

它提示我 `go1.16` 会存在不明确的依赖，因为我本地 `go` 版本已经是 `1.17`，所以接下来我直接运行了 `go mod tidy -compat=1.17`：

```bash
go mod tidy -compat=1.17
```

没有错误提示，看起来一切正常。但是当我尝试着编译时，它又开始「搞事情」：

```bash
$ go build
# github.com/google/cel-go/parser/gen
../../../../pkg/mod/github.com/google/cel-go@v0.9.0/parser/gen/cel_lexer.go:261:31: lexerDeserializer.DeserializeFromUInt16 undefined (type *antlr.ATNDeserializer has no field or method DeserializeFromUInt16)
../../../../pkg/mod/github.com/google/cel-go@v0.9.0/parser/gen/cel_parser.go:142:33: deserializer.DeserializeFromUInt16 undefined (type *antlr.ATNDeserializer has no field or method DeserializeFromUInt16)
```

没办法 😇，再回到一开始的输出，可以看到，两个 **module** 都导入了 antlr：

```plaintext
ambiguous import: found package github.com/antlr/antlr4/runtime/Go/antlr in multiple modules:
github.com/antlr/antlr4 v0.0.0-20200503195918-621b933c7a7f (/Users/xxx/go/pkg/mod/github.com/antlr/antlr4@v0.0.0-20200503195918-621b933c7a7f/runtime/Go/antlr)
github.com/antlr/antlr4/runtime/Go/antlr v1.4.10 (/Users/xxx/go/pkg/mod/github.com/antlr/antlr4/runtime/!go/antlr@v1.4.10)
```

[v0.0.0-20200503195918-621b933c7a7f](https://github.com/antlr/antlr4/tree/621b933c7a7f01c67ae9de15103151fa0f9d6d90/runtime/Go/antlr) 版本 antlr 还没使用 Go Module，所以和 [v1.4.10](https://github.com/antlr/antlr4/tree/runtime/Go/antlr/v1.4.10/runtime/Go/antlr) 产生了冲突。

需要继续研究为了什么同时依赖了两个不同版本的 antlr？借助 [modgraphviz](https://github.com/golang/exp/tree/master/cmd/modgraphviz) 和 [Graphviz](https://graphviz.org/) 生成模块依赖图：

```bash
go mod graph | egrep "cel-go|antlr" | modgraphviz | dot -Tsvg -o mod-graph.svg
```

![](./202212172136455.svg)

从图表中很容易发现根本原因是 dep2，dep3 分别依赖 cel-go 的 v0.9.0 和 v0.5.1。[MVS](https://go.dev/ref/mod#minimal-version-selection) 选择了 v0.9.0，实际上我们并没有使用 cel-go@v0.9.0 相关的代码，所以 **最终解决方法**：

```bash
go mod edit -replace=github.com/google/cel-go=github.com/google/cel-go@v0.5.1
```
