const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const config = {
  decapOrigin: "https://2026-websites-ricky-git-decap-preview-xyr-stars-projects.vercel.app",
  publicBase: "https://pub-9f290c4c2d7b479fad35f3c7051d2d9f.r2.dev",
};

function json(status, body) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readImage(request) {
  const sizeHeader = request.headers.get("content-length");
  const declaredSize = sizeHeader === null ? null : Number(sizeHeader);
  if (sizeHeader !== null && (!/^\d+$/.test(sizeHeader) || !Number.isSafeInteger(declaredSize))) {
    throw new UploadError(400, "文件长度无效。");
  }
  if (declaredSize > MAX_IMAGE_BYTES) throw new UploadError(413, "图片不能超过 15 MB。");
  if (!request.body || declaredSize === 0) throw new UploadError(400, "请选择一张图片。");

  const bytes = new Uint8Array(declaredSize ?? MAX_IMAGE_BYTES);
  const reader = request.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_IMAGE_BYTES) {
        throw new UploadError(413, "图片不能超过 15 MB。");
      }
      if (size + value.byteLength > bytes.length) {
        throw new UploadError(400, "文件长度不一致。");
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size || (declaredSize !== null && declaredSize !== size)) {
    throw new UploadError(400, "文件长度不一致或文件为空。");
  }
  return bytes.subarray(0, size);
}

function matchesImageType(bytes, type) {
  const tag = (offset, length = 4) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  switch (type) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((byte, index) => bytes[index] === byte);
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(tag(0, 6));
    case "image/webp":
      return tag(0) === "RIFF" && tag(8) === "WEBP";
    case "image/avif": {
      if (bytes.length < 16 || tag(4) !== "ftyp") return false;
      const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
      if (boxSize < 16 || boxSize > bytes.length) return false;
      if (["avif", "avis"].includes(tag(8))) return true;
      for (let offset = 16; offset + 4 <= Math.min(boxSize, 128); offset += 4) {
        if (["avif", "avis"].includes(tag(offset))) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

async function upload(request, env, url, config) {
  if (request.headers.get("origin") !== url.origin) {
    return json(403, { error: "请从上传页面提交图片。" });
  }
  const contentType = request.headers.get("content-type")?.toLowerCase();
  const extension = IMAGE_EXTENSIONS.get(contentType);
  if (!extension) return json(415, { error: "只支持 JPG、PNG、WebP、GIF 和 AVIF 图片。" });

  let bytes;
  try {
    bytes = await readImage(request);
  } catch (error) {
    if (error instanceof UploadError) return json(error.status, { error: error.message });
    return json(400, { error: "读取图片失败，请重试。" });
  }
  if (!matchesImageType(bytes, contentType)) {
    return json(415, { error: "图片内容与所选格式不符。" });
  }

  const key = "cms/" + crypto.randomUUID() + "." + extension;
  try {
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
  } catch {
    return json(502, { error: "保存图片失败，请重试。" });
  }
  return json(201, { url: config.publicBase + "/" + key });
}

function page(nonce, config) {
  const cspNonce = crypto.randomUUID();
  const settings = JSON.stringify({ nonce, origin: config.decapOrigin, maxBytes: MAX_IMAGE_BYTES })
    .replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>上传图片</title>
<style nonce="${cspNonce}">
body{font:1rem system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;line-height:1.6}
label,input,button{display:block;margin:.8rem 0}button{padding:.5rem .8rem}
#url{width:100%;box-sizing:border-box}button:disabled{opacity:.6}
</style>
</head>
<body>
<h1>上传图片</h1>
<form id="form">
<label for="image">选择图片（最大 15 MB）</label>
<input id="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" required>
<button id="upload" type="submit">上传</button>
</form>
<p id="status" role="status"></p>
<section id="result" hidden>
<label for="url">图片地址</label>
<input id="url" type="url" readonly>
<button id="copy" type="button">复制图片地址</button>
<a id="return" hidden>返回编辑器并插入</a>
<p>如果编辑器没有自动插入图片，请复制地址并粘贴到封面或正文。</p>
</section>
<script nonce="${cspNonce}">
const settings = ${settings};
const form = document.getElementById("form");
const status = document.getElementById("status");
const fileInput = document.getElementById("image");
const uploadButton = document.getElementById("upload");
const result = document.getElementById("result");
const urlInput = document.getElementById("url");
const returnLink = document.getElementById("return");
document.getElementById("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(urlInput.value);
    status.textContent = "已复制图片地址。";
  } catch {
    urlInput.focus();
    urlInput.select();
    status.textContent = "请复制已选中的图片地址。";
  }
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file || !file.size || file.size > settings.maxBytes) {
    status.textContent = "请选择一张不超过 15 MB 的图片。";
    return;
  }
  uploadButton.disabled = true;
  result.hidden = true;
  status.textContent = "正在上传…";
  try {
    const response = await fetch("/upload", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.url !== "string") {
      throw new Error(data?.error || "上传失败，请检查登录状态后重试。");
    }
    urlInput.value = data.url;
    result.hidden = false;
    status.textContent = "图片已上传。";
    if (settings.nonce) {
      returnLink.href = settings.origin + "/cms-trial/r2-return.html#" +
        new URLSearchParams({ nonce: settings.nonce, url: data.url });
      returnLink.hidden = false;
      if (window.opener) {
        window.opener.postMessage({ type: "ricky-r2-image", nonce: settings.nonce, url: data.url }, settings.origin);
      }
    }
  } catch (error) {
    status.textContent = error.message || "上传失败，请重试。";
  } finally {
    uploadButton.disabled = false;
  }
});
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'nonce-" + cspNonce +
        "'; style-src 'nonce-" + cspNonce + "'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (!ctx.access) {
      return json(403, { error: "请使用已授权的账号登录。" });
    }

    if (typeof env.MEDIA?.put !== "function") {
      return json(503, { error: "上传服务缺少 R2 素材桶绑定。" });
    }
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      const nonce = url.searchParams.get("nonce");
      if (nonce !== null && !UUID.test(nonce)) return json(400, { error: "无效的编辑器请求。" });
      return page(nonce, config);
    }
    if (url.pathname === "/upload" && request.method === "POST") {
      return upload(request, env, url, config);
    }
    return json(404, { error: "页面不存在。" });
  },
};
