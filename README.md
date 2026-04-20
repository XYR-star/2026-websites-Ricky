# Ricky Personal Site

一个基于 `Astro` 的中文个人内容网站，主要用于发布：

- 博客文章
- 科研进展
- 游记
- About 页面
- RSS 与 sitemap

线上地址：`https://www.heyrickishere.com`

## 项目特点

- 内容驱动：博客和科研更新都使用 `Markdown`
- 结构轻：没有数据库，没有后台，适合长期维护
- 发布简单：构建静态文件后由 `nginx` 提供服务
- 写作友好：内置模板和快捷脚本，方便快速新建内容

## 技术栈

- `Astro`
- `TypeScript`
- `Markdown`
- `Nginx`

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

默认站点域名配置在 `.env` 中：

```bash
SITE_URL=https://www.heyrickishere.com
```

## 常用命令

```bash
npm run dev
npm run check
npm run build
npm run admin:start
npm run deploy
npm run new:post -- my-new-post
npm run new:research -- weekly-update
npm run new:travel -- my-trip
```

## 内容工作流

### 新建博客

```bash
npm run new:post -- my-new-post
```

这会生成一个带当天日期的文件，例如：

```bash
src/content/blog/2026-04-20-my-new-post.md
```

博客模板位于：

- `templates/blog-post.md`

### 新建科研进展

```bash
npm run new:research -- weekly-update
```

这会生成一个带当天日期的文件，例如：

```bash
src/content/research/2026-04-20-weekly-update.md
```

科研模板位于：

- `templates/research-update.md`

### 新建游记

```bash
npm run new:travel -- my-trip
```

这会生成一个带当天日期的文件，例如：

```bash
src/content/travel/2026-04-20-my-trip.md
```

游记模板位于：

- `templates/travel-post.md`

### 写完后发布

```bash
npm run deploy
```

这个命令会自动：

- 构建站点
- 将 `dist/` 同步到 `/var/www/ricky-site`
- 重载 `nginx`

## 内容目录

```text
src/content/blog/        博客文章
src/content/research/    科研进展
src/content/travel/      游记
src/data/site.ts         站点基础信息
templates/               内容模板
scripts/                 发布与创建内容脚本
ops/                     部署配置
```

## Frontmatter 约定

### 博客

```md
---
title: "文章标题"
description: "一句摘要"
date: 2026-04-20
tags:
  - 标签
draft: false
---
```

### 科研进展

```md
---
title: "进展标题"
date: 2026-04-20
summary: "一句概括"
project: "项目名"
status: "进行中"
links:
  - label: "相关链接"
    href: "https://example.com/"
---
```

### 游记

```md
---
title: "游记标题"
description: "一句摘要"
date: 2026-04-20
draft: false
cover: "/images/travel/example/cover.jpg"
---
```

## 部署说明

项目当前使用：

- `nginx` 托管静态文件
- `certbot` 管理 HTTPS 证书
- `ufw` + `fail2ban` 做基础安全加固
- 独立的管理员服务处理 `/admin`

示例 `nginx` 配置见：

- `ops/nginx-site.conf`

管理员服务 systemd 配置见：

- `ops/ricky-admin.service`
- `ops/ricky-admin.env.example`

## 管理后台

第一版后台使用独立服务，不影响公开网站设计。

- 登录页：`/admin/login`
- 后台入口：`/admin`
- 支持：博客、科研进展、游记的 Markdown 编辑
- 支持：上传图片到 `public/images/...`
- 支持：保存内容并一键构建发布

后台运行依赖这些环境变量：

```bash
ADMIN_PORT=4322
ADMIN_RUNTIME_DIR=/var/lib/ricky-admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt-hash>
ADMIN_SESSION_SECRET=<long-random-secret>
ADMIN_COOKIE_SECURE=true
```

更新管理员密码：

```bash
npm run admin:set-password -- /etc/ricky-admin.env your-new-password
systemctl restart ricky-admin
```

## 备注

- `.env`、`.vscode`、`.codex` 等本地文件不会进入仓库
- `dist/` 为构建产物，不提交
- 当前仓库同时保留了一些写作素材与记录文件，供后续整理成正式文章
