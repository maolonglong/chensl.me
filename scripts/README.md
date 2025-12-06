# Markdown 图片下载脚本

自动下载 Markdown 文件中的外部图片到本地，并更新图片引用。

## 功能

- 🔍 自动扫描 Markdown 文件中的外部图片链接（http/https）
- 📥 下载图片到 Markdown 文件同一目录
- ✏️ 自动更新 Markdown 中的图片引用为相对路径（`./xxx.png`）
- 🎯 支持处理单个文件或整个目录
- 🧪 支持试运行模式（`--dry-run`）预览操作

## 使用方法

### 使用 npm 脚本（推荐）

```bash
# 处理单个文件
pnpm run download-images src/content/translations/writing-tools-for-agents/index.md

# 处理整个目录
pnpm run download-images src/content/blog

# 处理 src/content 目录下所有 Markdown 文件（默认）
pnpm run download-images

# 试运行模式
pnpm run download-images -- --dry-run src/content/blog
```

### 直接使用 Node.js

```bash
# 处理单个文件
node scripts/download-images.mjs src/content/translations/writing-tools-for-agents/index.md

# 处理整个目录
node scripts/download-images.mjs src/content/blog

# 处理 src/content 目录下所有 Markdown 文件（默认）
node scripts/download-images.mjs

# 试运行模式
node scripts/download-images.mjs --dry-run src/content/blog
```

## 示例

假设有以下 Markdown 文件 `src/content/blog/my-post/index.md`：

```markdown
# My Post

![Example](https://example.com/images/photo.jpg)
![Local](./local-image.png)
```

运行脚本后：

1. 下载 `https://example.com/images/photo.jpg` 到 `src/content/blog/my-post/photo.jpg`
1. 更新 Markdown 为：

```markdown
# My Post

![Example](./photo.jpg)
![Local](./local-image.png)
```

1. 本地图片引用保持不变

## 注意事项

- ✅ 只处理外部图片链接（http/https 开头）
- ✅ 本地图片引用（相对路径、绝对路径）会被跳过
- ✅ 图片文件名会根据原 URL 生成，过长或包含特殊字符时使用 `image-1.png` 格式
- ✅ 支持 `.md` 和 `.mdx` 文件
- ⚠️ 建议先使用 `--dry-run` 模式预览操作
- ⚠️ 建议在运行前提交代码或备份文件

## 文件名生成规则

- 优先使用原 URL 中的文件名（如 `photo.jpg`）
- 如果文件名过长（>50 字符）或包含特殊字符，使用 `image-{序号}.{扩展名}` 格式
- 保留原始文件扩展名，如果无法识别则默认使用 `.png`
