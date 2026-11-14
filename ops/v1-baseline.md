# v1.0.0 正式版基线

在开始 Payload v2 开发前，将已经跑通的 Astro + Decap/Turbo + GitHub + Vercel + R2 版本固定为 v1。

| 项目 | 冻结值 |
| --- | --- |
| 标签 | `v1.0.0`（annotated tag） |
| 标签对应提交 | `d5b026c7ca5029ca006a4b12de2667c57b8b8ffd` |
| 冻结分支 | `release/v1` |
| 正式 Vercel 部署 | `dpl_EwghDMoGYzvbPi8FaXiPJtcYQNfz` |
| 正式网站 | `https://www.heyrickishere.com/` |
| 素材域名 | `https://assets.heyrickishere.com` |

v2 在 `feat/payload-v2` 和独立后台项目中开发。固定 v1 标签没有修改 `main`，也没有切换正式网站域名。

## 备份范围

本机独立备份保存了 v1 源码归档、完整 Git bundle、正式文章引用的两张 R2 原图、图片校验和 HTTP 元数据，以及可读取的 Vercel 项目/环境变量名称元数据。已有本机未发布工作单独归档，不混入生产版本或这个仓库。

**这不是全桶或完整云端配置备份。**未引用的 R2 对象尚未完整导出；Cloudflare 线上 Access、CORS、Worker 绑定和运行时设置，以及 GitHub/Turbo 账号授权和规则仍需单独保存。密钥值不写入本文或公开仓库。仅位于同一电脑上的副本也不能替代异地备份。

## 恢复和版本规则

1. 在新目录从远程仓库或离线 bundle 恢复，检出 `v1.0.0` 并核对提交 SHA。
2. 按该版本锁文件安装，运行 `npm run check`、`npm run test:cms`、`npm run build`。
3. 核对 R2 旧地址、上传 Worker、Access、Turbo 和 Vercel 环境；代码归档不会恢复这些平台的账号配置。
4. 先验收测试部署，再通过恢复 PR 和部署流程回到正式站；不要强推 `main` 或改写 v1 标签。
5. v1 后续修复使用新提交与新版本号（例如 `v1.0.1`）。`v1.0.0` 始终指向上述冻结提交。

R2 文件独立于 Git。代码回退不会自动删除、恢复或回退素材。曾经公开的正文、图片和历史部署也不会因为代码回退变成私密。
