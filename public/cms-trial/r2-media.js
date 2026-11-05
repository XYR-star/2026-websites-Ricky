export function acceptedImage(value, publicOrigin) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === publicOrigin && !url.username && !url.password &&
      !url.search && !url.hash && /^\/cms\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif|avif)$/.test(url.pathname);
  } catch {
    return false;
  }
}

export const r2MediaLibrary = {
  name: "ricky-r2",
  init({ options, handleInsert }) {
    const worker = new URL(options.config.upload_url);
    const publicOrigin = new URL(options.config.public_url).origin;
    let cancel = () => {};

    return {
      show() {
        cancel();
        const nonce = crypto.randomUUID();
        const url = new URL(worker);
        url.searchParams.set("nonce", nonce);
        const popup = window.open(url.href, "_blank", "popup,width=560,height=580");
        if (!popup) {
          window.alert("浏览器拦截了上传窗口。请允许此页面打开弹窗后再试。");
          return;
        }
        const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("ricky-r2-" + nonce) : null;
        function insert(data) {
          if (data?.type !== "ricky-r2-image" || data.nonce !== nonce || !acceptedImage(data.url, publicOrigin)) return;
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
