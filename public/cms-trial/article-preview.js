function textField(entry, name) {
  const value = entry.getIn(["data", name]);
  return typeof value === "string" ? value.trim() : "";
}

export function plainPreviewData(value) {
  return typeof value?.toJS === "function" ? value.toJS() : value;
}

export function previewTheme(host = window) {
  const theme = host.document?.documentElement?.dataset?.editorTheme;
  if (theme === "dark" || theme === "light") return theme;
  try { return host.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
  catch { return "light"; }
}

// Templates render in an iframe; theme events originate in the host editor.
export function previewThemeLifecycle(host = window) {
  return {
    getInitialState() { return { editorTheme: previewTheme(host) }; },
    componentDidMount() {
      this.editorThemeListener = () => this.setState({ editorTheme: previewTheme(host) });
      host.addEventListener?.("ricky:editor-theme", this.editorThemeListener);
      this.editorThemeListener();
    },
    componentWillUnmount() {
      host.removeEventListener?.("ricky:editor-theme", this.editorThemeListener);
    },
  };
}

export function safePreviewLink(value, validator, { webOnly = false } = {}) {
  if (typeof value !== "string" || !value || value.trim() !== value || /[\s\\\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f-\u009f]/.test(decoded) || value.startsWith("//") || decoded.startsWith("//")) return false;
    if (webOnly ? !/^https?:\/\//i.test(value) : !/^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value)) return false;
    const url = new URL(value, "https://www.heyrickishere.com");
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return false;
    if (url.protocol === "mailto:" && url.pathname.startsWith("//")) return false;
    return typeof validator !== "function" || validator(value) === true;
  } catch { return false; }
}

function dateField(entry) {
  const value = entry.getIn(["data", "date"]);
  if (!value) return { label: "尚未填写日期" };

  // Imported frontmatter can provide a Date instead of the widget's string.
  // Date-only formatting keeps the calendar day stable on every editing device.
  const dateTime = typeof value === "string"
    ? value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1]
    : value instanceof Date && Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 10)
      : undefined;
  const date = dateTime ? new Date(dateTime + "T12:00:00Z") : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateTime) {
    return { label: "日期格式待检查" };
  }
  return {
    dateTime,
    label: new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
    }).format(date),
  };
}

function tagsField(entry) {
  const value = entry.getIn(["data", "tags"]);
  const tags = Array.isArray(value) ? value : value?.toArray?.();
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))];
}

function imageSource(asset) {
  if (!asset) return "";
  const value = String(asset).trim();
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === "https:" || url.protocol === "blob:") return url.href;
    if (/^data:image\/(?:jpeg|png|webp|gif|avif);base64,/i.test(value)) return value;
  } catch {
    return "";
  }
  return "";
}

export function registerArticlePreview(CMS, { isSafeLink } = {}) {
  const { createClass, h } = window;
  const createPreview = ({ label, requiredCover, showTags, research = false }) => createClass({
    ...previewThemeLifecycle(window),
    render() {
      const { entry, getAsset, widgetFor } = this.props;
      const title = textField(entry, "title");
      const description = textField(entry, research ? "summary" : "description");
      const date = dateField(entry);
      const cover = research ? "" : textField(entry, "cover");
      const body = textField(entry, "body");
      const tags = research ? [...new Set([textField(entry, "project"), textField(entry, "status")].filter(Boolean))]
        : showTags ? tagsField(entry) : [];
      const rawLinks = plainPreviewData(entry.getIn(["data", "links"]));
      const links = research && Array.isArray(rawLinks) ? rawLinks.filter((link) => link && typeof link === "object") : [];
      const image = cover ? imageSource(getAsset(cover)) : "";

      return h("article", { className: "article-preview", "data-editor-theme": this.state?.editorTheme ?? previewTheme(window) },
        h("header", { className: "article-preview__header" },
          h("p", { className: "article-preview__kicker" }, label + " · 文章预览"),
          h("h1", null, title || "未命名" + label),
          h("div", { className: "article-preview__meta" },
            h("p", { className: "article-preview__date" },
              date.dateTime ? h("time", { dateTime: date.dateTime }, date.label) : date.label,
            ),
            tags.length > 0 && h("ul", { className: "article-preview__tags", "aria-label": research ? "研究项目与状态" : "文章标签" },
              ...tags.map((tag) => h("li", { key: tag }, tag)),
            ),
          ),
          description && h("p", { className: "article-preview__description" }, description),
        ),
        image
          ? h("figure", { className: "article-preview__cover" },
              h("img", { src: image, alt: title ? title + "的封面" : label + "封面", decoding: "async" }),
            )
          : (cover || requiredCover) && h("p", { className: "article-preview__placeholder" },
              cover ? "封面暂不可预览。" : "选一张封面，上传后可以在这里预览。",
            ),
        h("div", { className: "article-preview__body" },
          body ? widgetFor("body") : h("p", { className: "article-preview__placeholder" }, "开始写正文，右侧会同步预览。"),
        ),
        links.length > 0 && h("section", { className: "article-preview__resources" },
          h("h2", null, "相关资料"),
          h("ul", null, ...links.map((link, index) => h("li", { key: index },
            safePreviewLink(link.href, isSafeLink, { webOnly: true })
              ? h("a", { href: link.href, target: "_blank", rel: "noopener noreferrer" }, typeof link.label === "string" && link.label ? link.label : link.href)
              : h("span", null, (typeof link.label === "string" ? link.label : "资料") + "（链接待检查）"),
          ))),
        ),
      );
    },
  });

  CMS.registerPreviewStyle("/cms-trial/article-preview.css");
  CMS.registerPreviewTemplate("travel", createPreview({ label: "游记", requiredCover: true, showTags: false }));
  CMS.registerPreviewTemplate("blog", createPreview({ label: "博客", requiredCover: false, showTags: true }));
  CMS.registerPreviewTemplate("research", createPreview({ label: "研究日志", requiredCover: false, showTags: false, research: true }));
}
