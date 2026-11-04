const status = document.getElementById("status");

try {
  const response = await fetch("/cms-trial/config.yml", { cache: "no-cache" });
  if (!response.ok) throw new Error();
  const config = await response.text();
  if (config.includes("00000000-0000-0000-0000-000000000000")) {
    status.textContent = "试用页面已就绪，等待绑定 Decap Turbo Site ID。";
  } else {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/decap-cms@3.17.0/dist/decap-cms.js";
    script.onload = () => status.remove();
    script.onerror = () => { status.textContent = "编辑器加载失败，请刷新重试。"; };
    document.body.append(script);
  }
} catch {
  status.textContent = "无法读取试用配置，请刷新重试。";
}
