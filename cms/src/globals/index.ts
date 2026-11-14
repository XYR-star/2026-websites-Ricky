import { randomUUID } from 'node:crypto'
import type { Block, Field, GlobalConfig } from 'payload'
import { adminOnly, readPublishedGlobal } from '../access/content.js'
import { captureGlobalPublication, notifyGlobalPublished, protectPublishedGlobal } from '../hooks/publishing.js'

const text = (name: string, label: string, required = false): Field => ({ name, label, type: 'text', defaultValue: '', required })
const prose = (name: string, label: string): Field => ({ name, label, type: 'textarea', defaultValue: '' })
const group = (name: string, label: string, fields: Field[]): Field => ({ name, label, type: 'group', fields })
const href = (name: string, label: string): Field => ({
  name, label, type: 'text', defaultValue: '', validate: (value: unknown) => {
    if (value === undefined || value === null || value === '') return true
    if (typeof value !== 'string' || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return '请填写有效的网址或站内链接。'
    let decoded: string
    try { decoded = decodeURIComponent(value) } catch { return '网址编码无效。' }
    if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith('//')) return '链接不安全。'
    if (value.startsWith('/') || value.startsWith('#')) return true
    try { const url = new URL(value); return (!url.username && !url.password && ['https:', 'http:', 'mailto:'].includes(url.protocol)) || '仅支持 http(s)、mailto 或站内链接。' } catch { return '网址无效。' }
  },
})
const sectionID = (): Field => ({
  name: 'sectionId', label: '固定链接编号', type: 'text', required: true,
  defaultValue: () => `section-${randomUUID()}`,
  validate: (value: unknown) => typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,79}$/u.test(value) || '编号需为 1–80 个文字、数字、短横线或下划线。',
  admin: { description: '保持编号不变，可以保留已经分享的段落链接。' },
})
const hero = (): Field => group('hero', '页头', [text('eyebrow', '小标题'), text('title', '标题', true), prose('intro', '介绍')])
const links = (name: string, label: string): Field => ({ name, label, type: 'array', defaultValue: [], fields: [text('label', '名称', true), href('href', '地址')] })

function page(slug: string, label: string, fields: Field[]): GlobalConfig {
  return {
    slug, label, admin: { group: '页面与站点', description: '保存草稿不会改变正式网站。发布后等待网站部署成功。' },
    access: { read: readPublishedGlobal, update: adminOnly, readVersions: adminOnly },
    versions: { drafts: { autosave: { interval: 2000 } }, max: 30 },
    hooks: { beforeOperation: [protectPublishedGlobal], beforeChange: [captureGlobalPublication], afterChange: [notifyGlobalPublished] },
    fields,
  }
}

const sectionFields = (): Field[] => [
  sectionID(),
  { name: 'enabled', label: '显示这一块', type: 'checkbox', defaultValue: true },
  { name: 'order', label: '旧排序记录', type: 'number', min: 0, max: 10000, admin: { hidden: true } },
  text('eyebrow', '小标题'), text('title', '标题'), text('linkLabel', '链接文字'), href('linkHref', '链接地址'),
]
const sectionBlock = (slug: string, label: string, fields: Field[] = []): Block => ({ slug, labels: { singular: label, plural: label }, fields: [...sectionFields(), ...fields] })
const count = (): Field => ({ name: 'count', label: '展示篇数', type: 'number', defaultValue: 3, min: 1, max: 24, required: true })

export const Homepage = page('homepage', '首页', [
  { name: 'layoutVersion', type: 'number', defaultValue: 1, admin: { hidden: true } },
  group('hero', '首页开场', [sectionID(), text('eyebrow', '小标题'), text('title', '标题', true), prose('intro', '介绍'), prose('note', '补充说明'), text('primaryLinkLabel', '主要链接文字'), href('primaryLinkHref', '主要链接地址'), text('secondaryLinkLabel', '次要链接文字'), href('secondaryLinkHref', '次要链接地址')]),
  {
    name: 'sections', label: '首页区块', type: 'blocks', maxRows: 50,
    admin: { description: '拖动排列区块。封面故事、继续阅读和首页开场各保留一块。' },
    blocks: [
      sectionBlock('magazineCover', '杂志封面', [text('travelSlug', '封面游记地址编号')]),
      sectionBlock('magazineContents', '继续阅读', [count()]),
      sectionBlock('homeIntro', '首页开场'),
      sectionBlock('featuredPosts', '最新博客', [count()]),
      sectionBlock('travelList', '游记列表', [count()]),
      sectionBlock('researchList', '研究日志', [count()]),
      sectionBlock('curatedLinks', '精选链接', [prose('body', '说明'), {
        name: 'items', label: '链接列表', type: 'array', defaultValue: [], fields: [text('eyebrow', '小标题'), text('title', '标题', true), prose('description', '介绍'), href('href', '链接地址')],
      }]),
      sectionBlock('nowSummary', '近况摘要', [prose('body', '内容')]),
      sectionBlock('aboutNote', '关于网站', [prose('body', '内容')]),
      sectionBlock('quote', '引言', [prose('quote', '引言内容')]),
      sectionBlock('richText', '自由文字', [prose('body', '内容')]),
    ],
  },
])

export const About = page('about', '关于我', [
  hero(),
  group('profileCard', '自我介绍', [text('sectionLabel', '小标题'), text('title', '标题'), prose('body', '介绍'), prose('secondaryBody', '补充介绍')]),
  group('facts', '个人信息', [text('sectionLabel', '小标题'), text('locationLabel', '地点标题'), text('location', '地点'), text('emailLabel', '联系标题'), text('email', '邮箱'), text('topicsLabel', '主题标题'), prose('topics', '关注主题')]),
  links('links', '外部链接'),
])

export const Now = page('now', '最近在做什么', [
  text('eyebrow', '小标题'), text('title', '标题', true), prose('intro', '介绍'),
  { name: 'items', label: '近况记录', type: 'array', defaultValue: [], fields: [prose('text', '记录')] },
])

export const Projects = page('projects', '长期项目', [
  hero(), { name: 'items', label: '项目', type: 'array', defaultValue: [], fields: [text('title', '名称', true), text('status', '状态'), prose('description', '介绍')] },
])

export const Tracks = page('tracks', '轨迹', [
  hero(), group('empty', '暂无轨迹时的说明', [text('title', '标题'), prose('description', '介绍')]),
])

export const Site = page('site', '站点简介', [
  text('title', '站点名称', true), prose('description', '站点简介'), prose('intro', '个人介绍'), prose('about', '关于作者'), text('email', '联系邮箱'), text('location', '所在地点'), links('socialLinks', '个人链接'),
])

export const siteGlobals = [Homepage, About, Now, Projects, Tracks, Site]
export { PAGE_NAMES, exportPageData, importPageData } from '../lib/page-data.js'
export type { PageName } from '../lib/page-data.js'
