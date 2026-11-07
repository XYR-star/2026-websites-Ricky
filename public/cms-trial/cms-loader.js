import { registerArticlePreview } from "./article-preview.js";
import { checkArticlePublication } from "./publish-check.js";
import { mountWritingHelp } from "../admin/writing-help.js";
import { r2MediaLibrary } from "./r2-media.js";

export async function startCMS({ configPath, branch }) {
  const statusMessage = document.getElementById("status");
  try {
    const response = await fetch(configPath, { cache: "no-cache" });
    if (!response.ok) throw new Error();
    const config = await response.text();
    if (config.includes("00000000-0000-0000-0000-000000000000")) {
      statusMessage.textContent = "后台已就绪，等待绑定 Decap Turbo Site ID。";
      return;
    }
    window.CMS_MANUAL_INIT = true;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/decap-cms@3.17.3/dist/decap-cms.js";
    script.integrity = "sha384-RWRzuHfiZSWCt3nEvG7B0v3cMgM1C2UuJmgBSL92GQh4uXmNSkbcthql/mNBqvjr";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      window.CMS.registerMediaLibrary(r2MediaLibrary);
      registerArticlePreview(window.CMS);
      window.CMS.registerEventListener({
        name: "prePublish",
        handler: (event) => checkArticlePublication(event, branch),
      });
      window.CMS.init();
      mountWritingHelp();
      statusMessage.remove();
    };
    script.onerror = () => { statusMessage.textContent = "编辑器加载失败，请刷新重试。"; };
    document.body.append(script);
  } catch {
    statusMessage.textContent = "无法读取后台配置，请刷新重试。";
  }
}
