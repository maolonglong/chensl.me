---
title: 代码示例
date: 2026-10-20T08:00:00
---

行内代码 `hugo build`。

```go
// Package feed 生成 RSS
package feed

func Summary(words int) string {
	if words > 1000 {
		return "长文" // 注释
	}
	return "短文"
}
```

```python
def count(root: str = "content/blog") -> int:
    """统计文章数量"""
    return 42
```

```bash
# 本地预览
mise run dev
```
