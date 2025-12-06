#!/usr/bin/env node
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * 下载图片到本地
 * @param {string} url - 图片 URL
 * @param {string} outputPath - 输出路径
 */
async function downloadImage(url, outputPath) {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to download ${url}: ${response.statusText}`);
		}

		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
		console.log(`✓ Downloaded: ${url} -> ${outputPath}`);
		return true;
	} catch (error) {
		console.error(`✗ Failed to download ${url}:`, error.message);
		return false;
	}
}

/**
 * 从 URL 生成本地文件名
 * @param {string} url - 图片 URL
 * @param {number} index - 图片索引
 */
function generateFilename(url, index) {
	try {
		const urlObj = new URL(url);
		let pathname = urlObj.pathname;

		// 处理 Next.js Image Optimization API 的情况
		// 例如: /_next/image?url=https%3A%2F%2Fexample.com%2Fimage.png&w=1920&q=75
		if (pathname.includes('/_next/image')) {
			const urlParam = urlObj.searchParams.get('url');
			if (urlParam) {
				try {
					const decodedUrl = decodeURIComponent(urlParam);
					const innerUrlObj = new URL(decodedUrl);
					pathname = innerUrlObj.pathname;
				} catch {
					// 如果解析失败，继续使用原 pathname
				}
			}
		}

		const ext = path.extname(pathname) || '.png';
		let basename = path.basename(pathname, ext);

		// 如果文件名太长或包含特殊字符，使用索引
		if (!basename || basename.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(basename)) {
			return `image-${index}${ext}`;
		}

		return `${basename}${ext}`;
	} catch {
		return `image-${index}.png`;
	}
}

/**
 * 处理单个 Markdown 文件
 * @param {string} filePath - Markdown 文件路径
 * @param {boolean} dryRun - 是否为试运行模式
 */
async function processMarkdownFile(filePath, dryRun = false) {
	console.log(`\n📄 Processing: ${filePath}`);

	const content = await fs.readFile(filePath, 'utf-8');
	const dir = path.dirname(filePath);

	// 匹配 Markdown 图片语法: ![alt](url)
	const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	const matches = [...content.matchAll(imageRegex)];

	if (matches.length === 0) {
		console.log('  No images found');
		return;
	}

	let newContent = content;
	let downloadCount = 0;
	const usedFilenames = new Set();

	for (let i = 0; i < matches.length; i++) {
		const match = matches[i];
		const [fullMatch, alt, url] = match;

		// 只处理外部 URL（http/https）
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			console.log(`  ⊘ Skipping local image: ${url}`);
			continue;
		}

		let filename = generateFilename(url, i + 1);

		// 处理文件名冲突
		if (usedFilenames.has(filename)) {
			const ext = path.extname(filename);
			const basename = path.basename(filename, ext);
			let counter = 2;
			while (usedFilenames.has(`${basename}-${counter}${ext}`)) {
				counter++;
			}
			filename = `${basename}-${counter}${ext}`;
		}
		usedFilenames.add(filename);

		const localPath = path.join(dir, filename);
		const relativePath = `./${filename}`;

		console.log(`  → ${url}`);
		console.log(`    Local: ${relativePath}`);

		if (!dryRun) {
			const success = await downloadImage(url, localPath);
			if (success) {
				// 替换 Markdown 中的 URL
				newContent = newContent.replace(fullMatch, `![${alt}](${relativePath})`);
				downloadCount++;
			}
		} else {
			console.log(`    [DRY RUN] Would download to: ${localPath}`);
			downloadCount++;
		}
	}

	if (!dryRun && downloadCount > 0) {
		await fs.writeFile(filePath, newContent, 'utf-8');
		console.log(`✓ Updated ${filePath} (${downloadCount} images)`);
	} else if (dryRun && downloadCount > 0) {
		console.log(`[DRY RUN] Would update ${filePath} (${downloadCount} images)`);
	}
}

/**
 * 递归查找所有 Markdown 文件
 * @param {string} dir - 目录路径
 */
async function findMarkdownFiles(dir) {
	const files = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findMarkdownFiles(fullPath)));
		} else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * 主函数
 */
async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const targetPath = args.find((arg) => !arg.startsWith('--')) || 'src/content';

	console.log('🖼️  Markdown Image Downloader');
	console.log('================================');
	if (dryRun) {
		console.log('⚠️  DRY RUN MODE - No files will be modified\n');
	}

	const stat = await fs.stat(targetPath);

	let files = [];
	if (stat.isFile()) {
		files = [targetPath];
	} else if (stat.isDirectory()) {
		files = await findMarkdownFiles(targetPath);
	}

	console.log(`Found ${files.length} Markdown file(s)\n`);

	for (const file of files) {
		await processMarkdownFile(file, dryRun);
	}

	console.log('\n✨ Done!');
}

main().catch(console.error);
