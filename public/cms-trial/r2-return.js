import { acceptedImage, MEDIA_ID } from "./r2-media.js";

const params = new URLSearchParams(location.hash.slice(1));
const nonce = params.get("nonce") ?? "";
const url = params.get("url") ?? "";
const message = document.getElementById("return-message");
history.replaceState(null, "", location.pathname);
if (MEDIA_ID.test(nonce) && acceptedImage(url)) {
  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel("ricky-r2-" + nonce);
    channel.postMessage({ type: "ricky-r2-image", nonce, url });
    channel.close();
  }
  message.textContent = "请返回原编辑器。如果图片没有自动填入，可以复制下面的地址。";
  document.getElementById("image-url").value = url;
  document.getElementById("image-fallback").hidden = false;
} else {
  message.textContent = "图片地址无效，请返回编辑器重新上传。";
}
