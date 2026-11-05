# 正式内容后台

正式入口：`https://www.heyrickishere.com/admin/`。第一版管理游记，沿用已验收的封面、正文、审核、R2 原图和素材复用。博客和研究文章仍按现有仓库流程维护。

## 工作流

保存草稿会提交到 `cms/travel/<文章文件名>` 并创建面向 `main` 的 PR。发布合并到 `main` 后，Vercel 自动部署正式网站。后台显示的已发布表示 GitHub 已合并；正式页面更新还需等待 Vercel 部署成功。构建失败时，上一版正式网站和已保存的草稿仍保留。

旧试用入口跳转正式后台。切换后关闭原试用编辑页面，刷新再编辑，避免两个后台复用同一草稿分支。不要同时在试用分支和正式分支编辑同一篇文章。正式配置使用现有 Turbo Site ID，`backend.branch: main` 覆盖 Turbo 默认分支。

## 首次启用设置

1. Cloudflare：重新部署 `ops/r2-media-worker.mjs`。保留覆盖所有流量的 Access、`MEDIA` 桶绑定和 `MEDIA_PUBLIC_BASE=https://assets.heyrickishere.com`。Worker 的 `production` 模式只允许回到 `https://www.heyrickishere.com/admin/r2-return.html`；旧版本没有这个回传目标。
2. Decap Turbo：在现有站点 Overview 中，将 Admin interface URLs 设为 `https://www.heyrickishere.com/admin/`，Branch 设为 `main`，Config path 设为 `public/admin/config.yml`。不需要新建付费站点。只保留正式后台登录来源。
3. GitHub：代码首次合入 `main`、`CMS content changes` 检查成功后，为 `main` 启用分支保护：必须通过 PR、必须通过 `CMS content changes` 检查、分支合并前必须保持最新。不要把 Decap Turbo App 加到绕过列表，不要求单人自己审核自己，禁用强制推送和分支删除。

`scripts/check-cms-changes.mjs` 在 GitHub Actions 中核对 CMS PR 只改对应游记及兼容的旧素材文件。检查使用目标分支代码，不执行草稿里的程序。普通开发 PR 不受 CMS 文件范围限制。浏览器发布前检查用于即时提示；GitHub 分支保护负责阻止绕过 PR 的写入，包括 CMS 合并失败时的直接写入回退。

## 验收

正式域名打开后台并登录，打开一篇游记，选用已有素材，检查封面和正文预览。修改文字保存草稿，刷新后确认保留，再发布并等待对应 GitHub 提交的 Vercel 生产部署成功。从未登录窗口访问文章确认图文正常。日常写作使用正式后台，代码开发使用功能分支和预览部署。

R2 公开素材和公开 GitHub 仓库中的草稿都可被公开读取。上传器和素材列表受 Access 保护。图片保持原文件，15 MB 上限，按文章素材目录 ID 归类；原图元数据也会保留。清理文件前核对文章和草稿引用。

## 回退

正式部署的历史版本由 Vercel 保留。需要回退站点代码时优先用 Git revert 后推送 `main`，让仓库与正式部署保持一致。R2 对象不随代码回退删除。不要将旧 CMS 草稿强行覆盖合并到主分支。
