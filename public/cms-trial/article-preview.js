function textField(entry, name) {
  const value = entry.getIn(["data", name]);
  return typeof value === "string" ? value.trim() : "";
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
  const TravelPreview = createClass({
    render() {
      const { entry, getAsset, widgetFor } = this.props;
      const title = textField(entry, "title");
      const description = textField(entry, "description");
      const date = textField(entry, "date");
      const cover = textField(entry, "cover");
      const body = textField(entry, "body");
      const image = cover ? imageSource(getAsset(cover)) : "";

      return h("article", { className: "travel-preview" },
        h("header", { className: "travel-preview__header" },
          h("p", { className: "travel-preview__kicker" }, "游记 · 文章预览"),
          h("h1", null, title || "未命名游记"),
          h("p", { className: "travel-preview__date" },
            date ? h("time", { dateTime: date }, date) : "尚未填写日期",
          ),
          description && h("p", { className: "travel-preview__description" }, description),
        ),
        image
          ? h("figure", { className: "travel-preview__cover" },
              h("img", { src: image, alt: title ? title + "的封面" : "游记封面", decoding: "async" }),
            )
          : h("p", { className: "travel-preview__placeholder" },
              cover ? "封面暂不可预览。" : "选一张封面，上传后可以在这里预览。",
            ),
        h("div", { className: "travel-preview__body" },
          body ? widgetFor("body") : h("p", { className: "travel-preview__placeholder" }, "开始写正文，右侧会同步预览。"),
        ),
      );
    },
  });

  CMS.registerPreviewStyle("/cms-trial/article-preview.css");
  CMS.registerPreviewTemplate("travel", TravelPreview);
}
