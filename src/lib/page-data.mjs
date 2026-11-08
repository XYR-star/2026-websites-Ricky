const sectionTypes = new Set([
  "featuredPosts", "travelList", "researchList", "curatedLinks",
  "nowSummary", "aboutNote", "quote", "richText",
]);
const pageNames = new Set(["homepage", "about", "now", "projects", "site"]);
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

/** externalOnly excludes links within this website; mailto remains an allowed external scheme. */
export function isSafeLink(value, { externalOnly = false } = {}) {
  if (typeof value !== "string" || !value || value.trim() !== value ||
      /\s/.test(value) || controlCharacters.test(value) || value.includes("\\")) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (controlCharacters.test(decoded) || decoded.includes("\\")) return false;
    if (value.startsWith("//") || (value.startsWith("/") && decoded.startsWith("//"))) return false;
    if (value.startsWith("/") || value.startsWith("#")) return !externalOnly;
    if (!/^(?:https?:\/\/|mailto:)/i.test(value)) return false;
    const url = new URL(value);
    const authority = /^https?:\/\/([^/?#]*)/i.exec(value)?.[1];
    if (url.username || url.password || authority?.includes("@")) return false;
    if (url.protocol === "http:" || url.protocol === "https:") return Boolean(url.hostname);
    return url.protocol === "mailto:" && !url.pathname.startsWith("//");
  } catch {
    return false;
  }
}

function fail(path, message) {
  throw new Error(`${path}：${message}`);
}

function object(value, path, allowedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "应填写一个对象。");
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) fail(`${path}.${key}`, "不是此页面支持的字段，请检查字段名称。");
  }
  return value;
}

function text(value, path, optional = false) {
  if (value === undefined && optional) return;
  if (typeof value !== "string") fail(path, "应填写文字；可以留空，但不能填写列表、对象或 null。");
}

function texts(value, path, required, optional = []) {
  for (const key of required) text(value[key], `${path}.${key}`);
  for (const key of optional) text(value[key], `${path}.${key}`, true);
}

function array(value, path, max = 100) {
  if (!Array.isArray(value)) fail(path, "应填写列表（没有内容时使用空列表 []）。");
  if (value.length > max) fail(path, `最多保留 ${max} 项，请减少列表内容。`);
  return value;
}

function link(value, path, { optional = false, empty = false } = {}) {
  if (value === undefined && optional) return;
  if (empty && value === "") return;
  if (!isSafeLink(value)) fail(path, "请使用 http://、https://、mailto:、以 / 开头的站内路径或 #锚点；不允许危险协议、控制字符或带账号密码的链接。");
}

function linkList(value, path) {
  array(value, path).forEach((item, index) => {
    const itemPath = `${path}[${index + 1}]`;
    object(item, itemPath, ["label", "href"]);
    texts(item, itemPath, ["label"]);
    link(item.href, `${itemPath}.href`);
  });
}

function hero(value, path, extraKeys = []) {
  object(value, path, ["eyebrow", "title", "intro", ...extraKeys]);
  texts(value, path, ["eyebrow", "title"], ["intro"]);
}

function sectionId(value, path, seen) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,79}$/u.test(value)) {
    fail(path, "请填写 1–80 个文字、数字、短横线或下划线，不含空格，且不要以短横线或下划线开头。");
  }
  if (seen.has(value)) fail(path, `编号「${value}」重复了；首页开场与各区块需要不同编号。`);
  seen.add(value);
}

function integer(value, path, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(path, `应填写 ${min}–${max} 之间的整数。`);
}

function homepage(data) {
  object(data, "首页", ["hero", "sections"]);
  hero(data.hero, "首页.hero", ["id", "note", "primaryLinkLabel", "primaryLinkHref", "secondaryLinkLabel", "secondaryLinkHref"]);
  texts(data.hero, "首页.hero", [], ["note", "primaryLinkLabel", "secondaryLinkLabel"]);
  link(data.hero.primaryLinkHref, "首页.hero.primaryLinkHref", { optional: true, empty: true });
  link(data.hero.secondaryLinkHref, "首页.hero.secondaryLinkHref", { optional: true, empty: true });
  const ids = new Set();
  sectionId(data.hero.id, "首页.hero.id", ids);
  array(data.sections, "首页.sections", 50).forEach((section, index) => {
    const path = `首页.sections[${index + 1}]`;
    object(section, path, ["id", "type", "enabled", "order", "eyebrow", "title", "linkLabel", "linkHref", "count", "body", "quote", "items"]);
    sectionId(section.id, `${path}.id`, ids);
    if (!sectionTypes.has(section.type)) fail(`${path}.type`, "请选择已支持的 8 种首页区块类型之一。");
    if (typeof section.enabled !== "boolean") fail(`${path}.enabled`, "应填写 true 或 false，表示是否显示这个区块。");
    if (section.order !== undefined) integer(section.order, `${path}.order`, 0, 10000);
    if (section.count !== undefined) integer(section.count, `${path}.count`, 1, 24);
    texts(section, path, [], ["eyebrow", "title", "linkLabel", "body", "quote"]);
    link(section.linkHref, `${path}.linkHref`, { optional: true, empty: true });
    if (section.type === "quote") text(section.quote, `${path}.quote`);
    if (["nowSummary", "aboutNote", "richText"].includes(section.type)) text(section.body, `${path}.body`);
    if (section.type === "curatedLinks" || section.items !== undefined) {
      array(section.items, `${path}.items`).forEach((item, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex + 1}]`;
        object(item, itemPath, ["eyebrow", "title", "description", "href"]);
        texts(item, itemPath, ["title", "description"], ["eyebrow"]);
        link(item.href, `${itemPath}.href`, { empty: true });
      });
    }
  });
}

function about(data) {
  object(data, "关于页", ["hero", "profileCard", "facts", "links"]);
  hero(data.hero, "关于页.hero");
  object(data.profileCard, "关于页.profileCard", ["sectionLabel", "title", "body", "secondaryBody"]);
  texts(data.profileCard, "关于页.profileCard", ["sectionLabel", "title", "body"], ["secondaryBody"]);
  object(data.facts, "关于页.facts", ["sectionLabel", "locationLabel", "location", "emailLabel", "email", "topicsLabel", "topics"]);
  texts(data.facts, "关于页.facts", ["sectionLabel", "locationLabel", "emailLabel", "topicsLabel"], ["location", "email", "topics"]);
  linkList(data.links, "关于页.links");
}

function now(data) {
  object(data, "近况页", ["eyebrow", "title", "intro", "items"]);
  texts(data, "近况页", ["eyebrow", "title"], ["intro"]);
  array(data.items, "近况页.items").forEach((item, index) => text(item, `近况页.items[${index + 1}]`));
}

function projects(data) {
  object(data, "项目页", ["hero", "items"]);
  hero(data.hero, "项目页.hero");
  array(data.items, "项目页.items").forEach((item, index) => {
    const path = `项目页.items[${index + 1}]`;
    object(item, path, ["title", "status", "description"]);
    texts(item, path, ["title", "status", "description"]);
  });
}

function site(data) {
  object(data, "站点信息", ["title", "description", "intro", "about", "email", "location", "socialLinks"]);
  texts(data, "站点信息", ["title", "description", "about", "email", "location"], ["intro"]);
  linkList(data.socialLinks, "站点信息.socialLinks");
}

/** Validate without reordering, normalizing text, generating IDs, or changing the supplied data. */
export function validatePageData(name, data) {
  if (!pageNames.has(name)) fail("页面", "不支持这个页面名称；请选择 homepage、about、now、projects 或 site。");
  ({ homepage, about, now, projects, site })[name](data);
  return data;
}

/** Validate a CMS save without returning a replacement entry or changing draft data. */
export function validateCMSPreSave({ collection, slug, path, data }) {
  if (collection === "pages") {
    if (!pageNames.has(slug) || path !== `src/data/${slug}.json`) {
      fail("页面草稿路径", "页面名称与文件名不匹配，请重新打开对应页面后保存。");
    }
    validatePageData(slug, data);
  } else if (collection === "research") {
    if (data?.links === undefined) return;
    array(data.links, "研究文章.links").forEach((item, index) => {
      const path = `研究文章.links[${index + 1}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) fail(path, "应填写链接对象。");
      text(item.label, `${path}.label`);
      if (!isSafeLink(item.href, { externalOnly: true }) || !/^https?:\/\//i.test(item.href)) {
        fail(`${path}.href`, "研究资料链接只允许 http:// 或 https://，不能带账号密码或控制字符。");
      }
    });
  }
}
