import type { CollectionConfig } from 'payload'
import { adminOnly } from '../access/content'
import { retryDeployment } from '../hooks/publishing'

export const Deployments: CollectionConfig = {
  slug: 'deployments',
  labels: { singular: '发布记录', plural: '发布记录' },
  admin: { group: '后台管理', useAsTitle: 'label', defaultColumns: ['label', 'status', 'createdAt', 'message'],
    components: { edit: { beforeDocumentControls: ['/components/RetryDeploymentButton#RetryDeploymentButton'] } },
    description: '内容发布与网站上线是两个步骤。“已请求部署”仅表示 Vercel 已接收请求，实际上线仍需确认部署成功。' },
  access: { read: adminOnly, create: () => false, update: () => false, delete: () => false },
  endpoints: [{ path: '/:id/retry', method: 'post', handler: retryDeployment }],
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
  ],
}
