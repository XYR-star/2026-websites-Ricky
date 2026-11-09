import { plainPreviewData, previewTheme, previewThemeLifecycle, safePreviewLink } from "../cms-trial/article-preview.js";

const PAGE_LABELS = { homepage: "首页", about: "关于我", now: "最近在做什么", projects: "长期项目", tracks: "轨迹", site: "站点简介" };
const LIST_LABELS = { featuredPosts: "最新博客", researchList: "研究记录", travelList: "游记" };
const MAGAZINE_TYPES = new Set(["magazineCover", "magazineContents", "homeIntro"]);
const string = (value) => typeof value === "string" ? value : "";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];

export function registerPagePreview(CMS, { isSafeLink } = {}) {
  const { createClass, h } = window;
  const paragraphs = (value) => string(value).split(/\n\s*\n/).filter((paragraph) => paragraph.trim())
    .map((paragraph, index) => h("p", { key: index }, paragraph));
  function link(label, href) {
    const title = string(label) || string(href);
    if (!title) return null;
    return safePreviewLink(href, isSafeLink)
      ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, title)
      : h("span", { className: "page-preview__invalid" }, title + "（链接待检查）");
  }
  function hero(value, fallback) {
    const data = object(value);
    return h("header", { className: "page-preview__hero" },
      string(data.eyebrow) && h("p", { className: "page-preview__eyebrow" }, data.eyebrow),
      h("h1", null, string(data.title) || fallback),
      ...paragraphs(data.intro), ...paragraphs(data.note),
      (data.primaryLinkLabel || data.secondaryLinkLabel) && h("div", { className: "page-preview__actions" },
        link(data.primaryLinkLabel, data.primaryLinkHref), link(data.secondaryLinkLabel, data.secondaryLinkHref)),
    );
  }
  function links(items) {
    return h("ul", { className: "page-preview__links" }, ...list(items).map((value, index) => {
      const item = object(value);
      return h("li", { key: index }, link(item.label, item.href));
    }));
  }
  function home(data) {
    // The array itself is the CMS drag order. Historic `order` fields are ignored.
    const sections = list(data.sections).map(object);
    const explicitLayout = data.layoutVersion === 1 || sections.some((section) => MAGAZINE_TYPES.has(section.type));
    const opening = explicitLayout ? [] : [hero(data.hero, "首页开场")];
    return [...opening, ...sections.filter((section) => section.enabled).map((section, index) => {
      const type = string(section.type);
      const id = string(section.id);
      const props = { className: "page-preview__section", key: id || index, "data-section-id": id };
      if (type === "homeIntro") return h("section", props, hero(data.hero, "首页开场"));
      if (type === "magazineCover") {
        const travelSlug = string(section.travelSlug).trim();
        return h("section", props,
          h("p", { className: "page-preview__eyebrow" }, string(section.eyebrow) || "精选游记"),
          h("h2", null, "杂志封面"),
          h("p", { className: "page-preview__notice" }, travelSlug
            ? `已指定游记「${travelSlug}」。所选游记不可用时会自动选取，完整图文请查看构建预览。`
            : "自动选取已发布且有封面的游记。完整图文请查看构建预览。"),
        );
      }
      if (type === "magazineContents") {
        const count = Number.isInteger(section.count) && section.count > 0 ? section.count : 2;
        const label = string(section.linkLabel ?? "全部归档");
        const href = string(section.linkHref ?? "/archive");
        return h("section", props, h("h2", null, string(section.title) || "继续阅读"),
          h("p", { className: "page-preview__notice" }, `发布后显示最多 ${count} 篇近期文章。完整图文请查看构建预览。`),
          label && href && link(label, href),
        );
      }
      let content;
      if (LIST_LABELS[type]) {
        const count = Number.isInteger(section.count) ? section.count : 3;
        content = h("p", { className: "page-preview__notice" }, `发布后这里显示 ${count} 条${LIST_LABELS[type]}，内容随文章更新。完整图文请查看构建预览。`);
      } else if (type === "curatedLinks") {
        content = h("div", null, ...paragraphs(section.body),
          h("div", { className: "page-preview__grid" }, ...list(section.items).map((value, itemIndex) => {
            const item = object(value);
            return h("section", { className: "page-preview__card", key: itemIndex },
              string(item.eyebrow) && h("p", { className: "page-preview__eyebrow" }, item.eyebrow),
              h("h3", null, string(item.title) || "推荐内容"), ...paragraphs(item.description),
              string(item.href) && link("查看内容", item.href),
            );
          })),
        );
      } else if (type === "quote") {
        content = h("blockquote", null, string(section.quote) || "待填写引言");
      } else if (["nowSummary", "aboutNote", "richText"].includes(type)) {
        content = h("div", null, ...paragraphs(section.body));
      } else {
        content = h("p", { className: "page-preview__notice" }, "区块类型待检查。请选择支持的首页区块。");
      }
      return h("section", props,
        string(section.eyebrow) && h("p", { className: "page-preview__eyebrow" }, section.eyebrow),
        h("h2", null, string(section.title) || LIST_LABELS[type] || "内容区块"), content,
        string(section.linkHref) && link(section.linkLabel, section.linkHref),
      );
    })];
  }
  function about(data) {
    const profile = object(data.profileCard);
    const facts = object(data.facts);
    return [hero(data.hero, "关于我"),
      h("div", { className: "page-preview__grid" },
        h("section", { className: "page-preview__card" },
          h("p", { className: "page-preview__eyebrow" }, string(profile.sectionLabel)),
          h("h2", null, string(profile.title) || "自我介绍"), ...paragraphs(profile.body), ...paragraphs(profile.secondaryBody)),
        h("section", { className: "page-preview__card" },
          h("h2", null, string(facts.sectionLabel) || "个人信息"),
          h("dl", null, ...["location", "email", "topics"].map((name) => h("div", { key: name },
            h("dt", null, string(facts[name + "Label"])), h("dd", null, string(facts[name])))))),
      ),
      list(data.links).length > 0 && h("section", { className: "page-preview__section" }, h("h2", null, "外部链接"), links(data.links)),
    ];
  }
  function now(data) {
    return [hero(data, "最近在做什么"), ...list(data.items).map((item, index) =>
      h("section", { className: "page-preview__card", key: index },
        h("p", { className: "page-preview__eyebrow" }, `Update ${index + 1}`), ...paragraphs(item)))];
  }
  function projects(data) {
    return [hero(data.hero, "长期项目"), ...list(data.items).map((value, index) => {
      const item = object(value);
      return h("section", { className: "page-preview__card", key: index },
        string(item.status) && h("span", { className: "page-preview__tag" }, item.status),
        h("h2", null, string(item.title) || "项目名称"), ...paragraphs(item.description));
    })];
  }
  function tracks(data) {
    const empty = object(data.empty);
    return [hero(data.hero, "轨迹"),
      h("section", { className: "page-preview__card" },
        h("h2", null, string(empty.title) || "暂无轨迹"), ...paragraphs(empty.description)),
    ];
  }
  function site(data) {
    return [hero({ title: data.title, eyebrow: "站点简介", intro: data.description }, "站点名称"),
      h("section", { className: "page-preview__card" },
        h("h2", null, "个人介绍"), ...paragraphs(data.intro), ...paragraphs(data.about),
        string(data.location) && h("p", null, "地点：" + data.location),
        string(data.email) && h("p", null, "联系：" + data.email),
        links(data.socialLinks)),
    ];
  }
  const renderers = { homepage: home, about, now, projects, tracks, site };
  CMS.registerPreviewStyle("/admin/page-preview.css");
  // Exact 3.17.3 FILES.templateName returns the file entry's slug, not collection name.
  for (const [name, label] of Object.entries(PAGE_LABELS)) {
    CMS.registerPreviewTemplate(name, createClass({
      ...previewThemeLifecycle(window),
      render() {
        const { entry } = this.props;
        const data = object(plainPreviewData(entry.get?.("data") ?? entry.getIn(["data"])));
        return h("article", { className: "page-preview", "data-editor-theme": this.state?.editorTheme ?? previewTheme(window) },
          h("p", { className: "page-preview__notice" }, `${label} · 内容预览。发布上线还需等待部署完成。`),
          ...renderers[name](data));
      },
    }));
  }
}
