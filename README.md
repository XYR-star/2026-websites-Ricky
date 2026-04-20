# Ricky Personal Site

一个基于 `Astro` 的中文个人内容网站，包含：

- 博客
- 科研进展
- 关于我
- RSS 与 sitemap

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

## 构建

```bash
npm run build
```

构建产物位于 `dist/`。
正式部署前请先在 `.env` 中设置 `SITE_URL`。
当前默认域名已设置为 `https://www.heyrickishere.com`。

## 常用命令

```bash
npm run dev
npm run check
npm run build
npm run deploy
npm run new:post -- my-new-post
npm run new:research -- weekly-update
```

## 内容维护

仓库里已经准备了两个模板：

- [templates/blog-post.md](/root/2026-websites-Ricky/templates/blog-post.md)
- [templates/research-update.md](/root/2026-websites-Ricky/templates/research-update.md)

最省事的用法是先复制模板，再改标题和正文。

也可以直接用脚本按当天日期生成文件名。

### 新增博客

在 `src/content/blog/` 下新增 Markdown 文件，frontmatter 使用：

```md
---
title: "文章标题"
description: "文章摘要"
date: 2026-04-20
tags:
  - 标签
draft: false
cover: "/optional-cover.jpg"
---
```

也可以直接复制模板：

```bash
cp templates/blog-post.md src/content/blog/my-new-post.md
```

或者直接生成：

```bash
npm run new:post -- my-new-post
```

这会创建一个类似这样的文件：

```bash
src/content/blog/2026-04-20-my-new-post.md
```

### 新增科研进展

在 `src/content/research/` 下新增 Markdown 文件，frontmatter 使用：

```md
---
title: "进展标题"
date: 2026-04-20
summary: "简要说明"
project: "项目名"
status: "进行中"
links:
  - label: "相关链接"
    href: "https://example.com/"
---
```

也可以直接复制模板：

```bash
cp templates/research-update.md src/content/research/my-update.md
```

或者直接生成：

```bash
npm run new:research -- weekly-update
```

这会创建一个类似这样的文件：

```bash
src/content/research/2026-04-20-weekly-update.md
```

## 部署

### Nginx

仓库内提供了示例配置：[ops/nginx-site.conf](/root/2026-websites-Ricky/ops/nginx-site.conf)。

### HTTPS

拿到正式域名后执行：

```bash
certbot --nginx -d heyrickishere.com -d www.heyrickishere.com
```

### 更新发布

```bash
npm run deploy
```

这个命令会自动：

- 构建站点
- 把 `dist/` 同步到 `/var/www/ricky-site`
- 重载 `nginx`

## 服务器安全基线

已安装：

- `nginx`
- `certbot`
- `python3-pip`
- `ufw`
- `fail2ban`

已完成：

- `ufw allow OpenSSH`
- `ufw allow 'Nginx Full'`
- 启用 `ufw`
- 为 `fail2ban` 添加 `sshd` jail
- 发布 `dist/` 到 `/var/www/ricky-site`
- 让 `nginx` 提供静态站点服务

待你确认后再继续：

- 补上邮箱、地点和外链
- 校验 `/etc/ssh/sshd_config`，决定是否禁用密码登录与 root 远程登录
- 等域名解析到当前服务器后执行 `certbot`
