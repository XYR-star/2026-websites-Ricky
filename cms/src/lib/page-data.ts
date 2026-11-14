export const PAGE_NAMES = ['homepage', 'about', 'now', 'projects', 'tracks', 'site'] as const
export type PageName = typeof PAGE_NAMES[number]

const forbidden = new Set(['id', '_status', 'createdAt', 'updatedAt', 'globalType', 'blockName'])
const topLevelKeys: Record<PageName, string[]> = {
  homepage: ['layoutVersion', 'hero', 'sections'], about: ['hero', 'profileCard', 'facts', 'links'], now: ['eyebrow', 'title', 'intro', 'items'], projects: ['hero', 'items'], tracks: ['hero', 'empty'], site: ['title', 'description', 'intro', 'about', 'email', 'location', 'socialLinks'],
}

function clean(value: unknown): any {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key) || child === null || child === undefined) continue
      result[key === 'sectionId' ? 'id' : key === 'blockType' ? 'type' : key] = clean(child)
    }
    return result
  }
  return value
}

export function exportPageData(name: PageName, doc: Record<string, any>): Record<string, any> {
  const output = Object.fromEntries(topLevelKeys[name].filter(key => doc[key] !== undefined && doc[key] !== null).map(key => [key, clean(doc[key])]))
  if (name === 'now') output.items = (doc.items ?? []).map((item: any) => typeof item === 'string' ? item : item.text ?? '')
  return output
}

/** Convert existing JSON to Payload fields, retaining public anchor IDs. */
export function importPageData(name: PageName, data: Record<string, any>): Record<string, any> {
  if (!PAGE_NAMES.includes(name)) throw new Error('不支持的页面。')
  const output = structuredClone(data)
  if (name === 'homepage') {
    if (output.hero?.id) { output.hero.sectionId = output.hero.id; delete output.hero.id }
    output.sections = (output.sections ?? []).map((section: Record<string, any>) => {
      const { id, type, ...fields } = section
      return { ...fields, sectionId: id, blockType: type }
    })
  }
  if (name === 'now') output.items = (output.items ?? []).map((item: string) => ({ text: item }))
  return output
}
