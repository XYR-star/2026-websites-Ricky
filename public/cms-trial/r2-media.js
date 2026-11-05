export const MEDIA_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ASSET_ORIGINS = new Set([
  "https://pub-9f290c4c2d7b479fad35f3c7051d2d9f.r2.dev",
  "https://assets.heyrickishere.com",
]);
const COLLECTIONS = new Set(["travel", "blog", "research"]);
const IMAGE_EXTENSION = /\.(?:jpg|png|webp|gif|avif)$/;

export function acceptedImage(value, article) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (!ASSET_ORIGINS.has(url.origin) || url.username || url.password ||
        url.search || url.hash || !IMAGE_EXTENSION.test(url.pathname)) return false;
    const segments = url.pathname.split("/").slice(1);
    const imageId = segments.at(-1).replace(IMAGE_EXTENSION, "");
    if (segments[0] !== "cms" || !MEDIA_ID.test(imageId)) return false;
    // Existing flat URLs and the previous Worker remain usable during rollout.
    return segments.length === 2 || (segments.length === 4 &&
      COLLECTIONS.has(segments[1]) && MEDIA_ID.test(segments[2]) &&
      (!article || (segments[1] === article.collection && segments[2] === article.folder)));
  } catch {
    return false;
  }
}

function currentArticle() {
  const entry = window.CMS?.editor?.getCurrentEntry?.();
  const folder = entry?.data?.media_id;
  if (!entry || !COLLECTIONS.has(entry.collection) || typeof folder !== "string" || !MEDIA_ID.test(folder)) {
    return null;
  }
  return {
    collection: entry.collection,
    folder: folder.toLowerCase(),
  };
}

export const r2MediaLibrary = {
  name: "ricky-r2",
  init({ options, handleInsert }) {
    const worker = new URL(options.config.upload_url);
    const editorMode = options.config.editor_mode ?? "trial";
    if (!["trial", "production"].includes(editorMode)) {
      throw new Error("素材库的编辑器来源配置无效。");
    }
    let cancel = () => {};

    return {
      show() {
        cancel();
        const article = currentArticle();
        if (!article) {
          window.alert("请先打开一篇文章，等素材目录 ID 生成后再选图。");
          return;
        }
        const nonce = crypto.randomUUID();
        const url = new URL(worker);
        url.searchParams.set("editor", editorMode);
        url.searchParams.set("nonce", nonce);
        url.searchParams.set("collection", article.collection);
        url.searchParams.set("folder", article.folder);
        const popup = window.open(url.href, "_blank", "popup,width=560,height=580");
        if (!popup) {
          window.alert("浏览器拦截了上传窗口。请允许此页面打开弹窗后再试。");
          return;
        }
        const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("ricky-r2-" + nonce) : null;
        function insert(data) {
          if (data?.type !== "ricky-r2-image" || data.nonce !== nonce || !acceptedImage(data.url, article)) return;
          const active = currentArticle();
          if (active?.collection !== article.collection || active.folder !== article.folder) {
            cancel();
            window.alert("当前文章已切换。图片已保存，请回到原文章的素材目录重新选用。");
            return;
          }
          cancel();
          handleInsert(data.url);
        }
        function receive(event) {
          if (event.origin === worker.origin && event.source === popup) insert(event.data);
        }
        window.addEventListener("message", receive);
        if (channel) channel.onmessage = (event) => insert(event.data);
        const timeout = window.setTimeout(() => cancel(), 15 * 60 * 1000);
        cancel = () => {
          window.removeEventListener("message", receive);
          window.clearTimeout(timeout);
          channel?.close();
          popup.close();
          cancel = () => {};
        };
      },
      hide() {
        cancel();
      },
      enableStandalone: () => false,
    };
  },
};
