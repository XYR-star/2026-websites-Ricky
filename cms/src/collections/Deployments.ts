import type { CollectionConfig } from 'payload'
import { adminOnly } from '../access/content'
import { retryDeployment } from '../hooks/publishing'
import { checkPublication } from '../endpoints/checkPublication'

export const Deployments: CollectionConfig = {
  slug: 'deployments',
  labels: { singular: '发布记录', plural: '发布记录' },
  admin: { group: '后台管理', useAsTitle: 'label', defaultColumns: ['label', 'status', 'siteStatus', 'siteCheckedAt', 'createdAt'],
    components: { edit: { beforeDocumentControls: ['/components/RetryDeploymentButton#RetryDeploymentButton', '/components/ContentVerification#ContentVerification'] } },
    description: '部署请求与内容上线分别显示。打开记录可核对正式站内容；检查失败不等于构建失败。' },
  access: { read: adminOnly, create: () => false, update: () => false, delete: () => false },
  endpoints: [{ path: '/:id/retry', method: 'post', handler: retryDeployment }, { path: '/:id/check', method: 'post', handler: checkPublication }],
  fields: [
    { name: 'eventKey', type: 'text', unique: true, required: true, admin: { hidden: true } },
    { name: 'label', label: '操作', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'status', label: '状态', type: 'select', required: true, options: [
      { label: '等待配置预览部署', value: 'not-configured' },
      { label: '正在发送部署请求', value: 'pending' },
      { label: '已请求部署', value: 'requested' },
      { label: '部署请求失败', value: 'failed' },
    ], admin: { readOnly: true } },
    { name: 'message', label: '说明', type: 'textarea', admin: { readOnly: true } },
    { name: 'jobId', label: 'Vercel 请求编号', type: 'text', admin: { readOnly: true } },
    { name: 'contentBinding', type: 'json', admin: { hidden: true }, access: { create: () => false, update: () => false } },
    { name: 'siteStatus', label: '正式站内容', type: 'select', defaultValue: 'not-tracked', options: [
      { label: '等待内容核验', value: 'waiting' }, { label: '已上线（内容已核验）', value: 'verified' },
      { label: '网站当前为其他版本', value: 'different' }, { label: '网站检查失败', value: 'check-failed' },
      { label: '旧记录无法核验', value: 'not-tracked' },
    ], admin: { readOnly: true }, access: { create: () => false, update: () => false } },
    { name: 'siteCheckedAt', label: '网站核验时间', type: 'date', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
    { name: 'siteMessage', label: '网站核验说明', type: 'textarea', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
  ],
}
