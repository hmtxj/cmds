#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');

console.log('Cleaning dist directory...');
if (fs.existsSync(distDir)) {
  fs.removeSync(distDir);
}

console.log('Building frontend...');
execSync('npx --yes vite build', { cwd: rootDir, stdio: 'inherit', shell: true });

console.log('Copying static assets...');
if (fs.existsSync(publicDir)) {
  fs.copySync(publicDir, distDir);
  console.log('Copied all static assets');
}

// 替换时间戳
console.log('Replacing timestamp in index.html...');
const indexHtmlPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const timestamp = Date.now();
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  html = html.replace(/(\?t=)\d+/g, `$1${timestamp}`);
  fs.writeFileSync(indexHtmlPath, html, 'utf8');
  console.log(`Updated timestamp to ${timestamp}`);
}

// 保留 index.html 作为备份，创建 dashboard.html（Worker 模式用）
const dashboardHtmlPath = path.join(distDir, 'dashboard.html');
if (fs.existsSync(indexHtmlPath)) {
  if (!fs.existsSync(dashboardHtmlPath)) {
    fs.copySync(indexHtmlPath, dashboardHtmlPath);
  }
}

// 打包 Worker 代码为 _worker.js（兼容 Cloudflare Pages 部署）
console.log('Bundling Worker code into _worker.js...');
await esbuild.build({
  entryPoints: [path.join(srcDir, 'index.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: path.join(distDir, '_worker.js'),
  external: ['__STATIC_CONTENT_MANIFEST'],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
});
console.log('_worker.js generated successfully');

// 添加 Pages fallback：如果 ASSETS 不可用，用本地读取代替
const workerPath = path.join(distDir, '_worker.js');
let workerCode = fs.readFileSync(workerPath, 'utf8');
workerCode = workerCode.replace(
  'const res = await env.ASSETS.fetch(',
  'const res = await (env.ASSETS || { fetch: () => new Response("Not Found", { status: 404 }) }).fetch('
);
fs.writeFileSync(workerPath, workerCode, 'utf8');
console.log('_worker.js patched for Pages compatibility');

console.log('Build complete!');
