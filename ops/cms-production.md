# 正式内容后台

正式入口：`https://www.heyrickishere.com/admin/`。支持博客与游记，沿用封面、正文、审核、R2 原图和素材复用。研究文章仍按现有仓库流程维护。

## 工作流

保存草稿会提交到 `cms/blog/<文章文件名>` 或 `cms/travel/<文章文件名>` 并创建面向 `main` 的 PR。发布合并到 `main` 后，Vercel 自动部署正式网站。后台显示的已发布表示 GitHub 已合并；正式页面更新还需等待 Vercel 部署成功。构建失败时，上一版正式网站和已保存的草稿仍保留。

旧试用入口跳转正式后台。切换后关闭原试用编辑页面，刷新再编辑，避免两个后台复用同一草稿分支。不要同时在试用分支和正式分支编辑同一篇文章。正式配置使用现有 Turbo Site ID，`backend.branch: main` 覆盖 Turbo 默认分支。

## 首次启用设置

1. Cloudflare：重新部署 `ops/r2-media-worker.mjs`。保留覆盖所有流量的 Access、`MEDIA` 桶绑定和 `MEDIA_PUBLIC_BASE=https://assets.heyrickishere.com`。Worker 的 `production` 模式只允许回到 `https://www.heyrickishere.com/admin/r2-return.html`；旧版本没有这个回传目标。
2. Decap Turbo：在现有站点 Overview 中，将 Admin interface URLs 设为 `https://www.heyrickishere.com/admin/`，Branch 设为 `main`，Config path 设为 `public/admin/config.yml`。不需要新建付费站点。只保留正式后台登录来源。
3. GitHub：代码首次合入 `main`、`CMS content changes` 检查成功后，为 `main` 启用分支保护：必须通过 PR、必须通过 `CMS content changes` 检查。不要把 Decap Turbo App 加到绕过列表，不要求单人自己审核自己，禁用强制推送和分支删除。

`scripts/check-cms-changes.mjs` 在 GitHub Actions 中核对 CMS PR 只改对应博客或游记及兼容的旧素材文件。检查使用目标分支代码，不执行草稿里的程序。普通开发 PR 不受 CMS 文件范围限制。浏览器发布前检查用于即时提示；GitHub 分支保护负责阻止绕过 PR 的写入，包括 CMS 合并失败时的直接写入回退。

## 写作与恢复

文章列表默认按日期倒序，可按年份分组。博客封面可留空，多个标签用英文逗号分隔。表单末尾的素材归档编号自动生成，沿用当前文章目录。

右下角「写作帮助」解释保存、预览与正式部署的区别。原生编辑器约 2 秒防抖尝试写入本机备份；重开同域名、同浏览器里的同一篇文章时，可接受恢复提示。它不能代替成功保存到 GitHub；换设备前等待「修改已保存」。当前没有云端自动保存或双设备并发防覆盖保证。

新文章优先使用新建。原生复制会沿用 media_id；不要在首次保存时无条件重置，否则此前上传图片的归档目录会改变。

本轮只需部署 Vercel 网站代码，现有 Worker 已支持博客、游记和研究文章的目录参数，不需要重部署图片服务。真实上传服务仍保留现有类型、大小和 Access 限制。

## 导入本地草稿

从已支持该集合的最新 main 创建 `cms/blog/<文件名>`，仅提交对应 Markdown，补充稳定的 media_id。工作副本使用 draft: false，由未合并的 CMS 分支保持审核草稿状态，避免最终发布后被网站隐藏。创建普通 open PR，面向 main，并添加 cms/draft 标签；不要使用 GitHub 自身的 Draft PR 状态。确认后台工作流能打开后，继续编辑，内容 PR 保持未合并直到明确发布。

## 验收

正式域名打开后台并登录，打开一篇游记，选用已有素材，检查封面和正文预览。修改文字保存草稿，刷新后确认保留，再发布并等待对应 GitHub 提交的 Vercel 生产部署成功。从未登录窗口访问文章确认图文正常。日常写作使用正式后台，代码开发使用功能分支和预览部署。

R2 公开素材和公开 GitHub 仓库中的草稿都可被公开读取。上传器和素材列表受 Access 保护。图片保持原文件，15 MB 上限，按文章素材目录 ID 归类；原图元数据也会保留。清理文件前核对文章和草稿引用。

## 回退

正式部署的历史版本由 Vercel 保留。需要回退站点代码时优先用 Git revert 后推送 `main`，让仓库与正式部署保持一致。R2 对象不随代码回退删除。不要将旧 CMS 草稿强行覆盖合并到主分支。
