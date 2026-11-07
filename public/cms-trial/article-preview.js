function textField(entry, name) {
  const value = entry.getIn(["data", name]);
  return typeof value === "string" ? value.trim() : "";
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

export function registerArticlePreview(CMS) {
  const { createClass, h } = window;
  const createPreview = ({ label, requiredCover, showTags }) => createClass({
    render() {
      const { entry, getAsset, widgetFor } = this.props;
      const title = textField(entry, "title");
      const description = textField(entry, "description");
      const date = dateField(entry);
      const cover = textField(entry, "cover");
      const body = textField(entry, "body");
      const tags = showTags ? tagsField(entry) : [];
      const image = cover ? imageSource(getAsset(cover)) : "";

      return h("article", { className: "article-preview" },
        h("header", { className: "article-preview__header" },
          h("p", { className: "article-preview__kicker" }, label + " · 文章预览"),
          h("h1", null, title || "未命名" + label),
          h("div", { className: "article-preview__meta" },
            h("p", { className: "article-preview__date" },
              date.dateTime ? h("time", { dateTime: date.dateTime }, date.label) : date.label,
            ),
            tags.length > 0 && h("ul", { className: "article-preview__tags", "aria-label": "文章标签" },
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
      );
    },
  });

  CMS.registerPreviewStyle("/cms-trial/article-preview.css");
  CMS.registerPreviewTemplate("travel", createPreview({ label: "游记", requiredCover: true, showTags: false }));
  CMS.registerPreviewTemplate("blog", createPreview({ label: "博客", requiredCover: false, showTags: true }));
}
