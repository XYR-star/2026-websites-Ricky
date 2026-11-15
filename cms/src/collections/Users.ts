import { APIError, type CollectionConfig } from 'payload'
import { isContentAdmin } from '../access/content'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: '管理员', plural: '管理员' },
  admin: { useAsTitle: 'email', group: '后台管理' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 2 * 60 * 60,
    useSessions: true,
    cookies: { secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' },
  },
  access: {
    create: () => false,
    read: ({ req }) => isContentAdmin(req) ? { id: { equals: req.user!.id } } : false,
    update: ({ req }) => isContentAdmin(req) ? { id: { equals: req.user!.id } } : false,
    delete: () => false,
    admin: ({ req }) => isContentAdmin(req),
  },
  hooks: {
    beforeValidate: [async ({ operation, data, req, context }) => {
      if (operation !== 'create') return data
      const expected = process.env.CMS_ADMIN_EMAIL?.trim().toLowerCase()
      if (!context.bootstrapOwner || !expected || data?.email?.trim().toLowerCase() !== expected) {
        throw new APIError('后台仅允许通过受控初始化命令创建管理员。', 403)
      }
      const existing = await req.payload.find({ collection: 'users', limit: 1, depth: 0, overrideAccess: true, req })
      if (existing.totalDocs) throw new APIError('管理员已存在，不能再次初始化。', 409)
      return { ...data, email: expected, role: 'admin' }
    }],
  },
  fields: [{
    name: 'role', label: '身份', type: 'select', options: [{ label: '个人管理员', value: 'admin' }],
    defaultValue: 'admin', required: true, admin: { readOnly: true },
    access: { update: () => false },
  }],
}
