import { registerArticlePreview } from "./article-preview.js";
import { checkTravelPublication } from "./publish-check.js";
import { r2MediaLibrary } from "./r2-media.js";

const statusMessage = document.getElementById("status");

try {
  const response = await fetch("/cms-trial/config.yml", { cache: "no-cache" });
  if (!response.ok) throw new Error();
  const config = await response.text();
  if (config.includes("00000000-0000-0000-0000-000000000000")) {
    statusMessage.textContent = "试用页面已就绪，等待绑定 Decap Turbo Site ID。";
  } else {
    window.CMS_MANUAL_INIT = true;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/decap-cms@3.17.3/dist/decap-cms.js";
    script.integrity = "sha384-RWRzuHfiZSWCt3nEvG7B0v3cMgM1C2UuJmgBSL92GQh4uXmNSkbcthql/mNBqvjr";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      window.CMS.registerMediaLibrary(r2MediaLibrary);
      registerArticlePreview(window.CMS);
      window.CMS.registerEventListener({ name: "prePublish", handler: checkTravelPublication });
      window.CMS.init();
      statusMessage.remove();
    };
    script.onerror = () => { statusMessage.textContent = "编辑器加载失败，请刷新重试。"; };
    document.body.append(script);
  }
} catch {
  statusMessage.textContent = "无法读取试用配置，请刷新重试。";
}
