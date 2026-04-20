let csrfToken = "";

const appEl = document.getElementById("app");
const logoutButton = document.getElementById("logout-button");

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {}),
      ...(csrfToken && options.method && options.method !== "GET"
        ? { "X-CSRF-Token": csrfToken }
        : {}),
    },
  });

  if (response.status === 401) {
    window.location.href = "/admin/login";
    return null;
  }

  return response;
}

function setActiveNav(pathname) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const target = link.getAttribute("data-nav");
    const current = pathname === "/admin" ? "/" : pathname.replace(/^\/admin/, "");
    link.classList.toggle("is-active", current === target);
  });
}

function dashboardView() {
  appEl.innerHTML = `
    <div class="admin-grid">
      <section>
        <div class="admin-kicker">Overview</div>
        <h2 class="admin-title" style="font-size:2.1rem">从这里进入各个内容板块</h2>
        <p class="markdown-help">第一版支持博客、科研进展和游记的 Markdown 编辑，以及图片上传和一键发布。</p>
      </section>
      <div class="admin-grid two">
        <a class="admin-card upload-card" href="/admin/blog">
          <div class="admin-kicker">Blog</div>
          <h3>管理博客</h3>
          <p class="markdown-help">新增、修改博客文章，支持封面图和 Markdown 正文。</p>
        </a>
        <a class="admin-card upload-card" href="/admin/research">
          <div class="admin-kicker">Research</div>
          <h3>管理科研进展</h3>
          <p class="markdown-help">维护研究更新、项目状态和相关链接。</p>
        </a>
        <a class="admin-card upload-card" href="/admin/travel">
          <div class="admin-kicker">Travel</div>
          <h3>管理游记</h3>
          <p class="markdown-help">上传图片、设置封面，并发布带图游记内容。</p>
        </a>
      </div>
    </div>
  `;
}

function renderMessage(text = "", type = "success") {
  if (!text) {
    return "";
  }
  return `<div class="admin-message ${type}">${escapeHtml(text)}</div>`;
}

async function listView(collection) {
  const response = await apiFetch(`/api/admin/content/${collection}`);
  if (!response) return;
  const result = await response.json();
  const titleMap = {
    blog: "博客",
    research: "科研进展",
    travel: "游记",
  };

  appEl.innerHTML = `
    <div class="admin-grid">
      <div class="admin-actions">
        <a class="link-button button-accent" href="/admin/${collection}/new">新建${titleMap[collection]}</a>
      </div>
      <div class="admin-list">
        ${result.items
          .map(
            (item) => `
            <article class="admin-list-item">
              <div>
                <div class="meta-row">
                  <span>${escapeHtml(String(item.date ?? ""))}</span>
                  ${item.draft ? "<span>Draft</span>" : ""}
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p class="markdown-help">${escapeHtml(item.description ?? "")}</p>
              </div>
              <a class="link-button button-secondary" href="/admin/${collection}/${item.slug}">编辑</a>
            </article>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildEditorFields(collection, entry = null) {
  const isNew = !entry;
  const slug = isNew ? "" : entry.slug.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const common = `
    <div class="admin-grid two">
      <div class="field-group">
        <label for="title">标题</label>
        <input id="title" name="title" value="${escapeHtml(entry?.title ?? "")}" required />
      </div>
      <div class="field-group">
        <label for="slug">Slug</label>
        <input id="slug" name="slug" value="${escapeHtml(slug)}" ${isNew ? "" : "readonly"} required />
      </div>
    </div>
    <div class="admin-grid two">
      <div class="field-group">
        <label for="date">日期</label>
        <input id="date" name="date" type="date" value="${escapeHtml(String(entry?.date ?? new Date().toISOString().slice(0, 10)))}" required />
      </div>
      ${
        collection === "research"
          ? ""
          : `<div class="field-group field-inline" style="padding-top:2rem">
               <input id="draft" name="draft" type="checkbox" ${entry?.draft ? "checked" : ""} />
               <label for="draft">作为草稿保存</label>
             </div>`
      }
    </div>
  `;

  if (collection === "blog") {
    return `
      ${common}
      <div class="field-group">
        <label for="description">摘要</label>
        <input id="description" name="description" value="${escapeHtml(entry?.description ?? "")}" required />
      </div>
      <div class="field-group">
        <label for="tags">标签（逗号分隔）</label>
        <input id="tags" name="tags" value="${escapeHtml((entry?.tags ?? []).join(", "))}" />
      </div>
      <div class="field-group">
        <label for="cover">封面图路径（可选）</label>
        <input id="cover" name="cover" value="${escapeHtml(entry?.cover ?? "")}" />
      </div>
      <div class="field-group">
        <label for="body">正文 Markdown</label>
        <textarea id="body" name="body">${escapeHtml(entry?.body ?? "")}</textarea>
      </div>
    `;
  }

  if (collection === "research") {
    return `
      ${common}
      <div class="field-group">
        <label for="summary">摘要</label>
        <input id="summary" name="summary" value="${escapeHtml(entry?.summary ?? "")}" required />
      </div>
      <div class="admin-grid two">
        <div class="field-group">
          <label for="project">项目名</label>
          <input id="project" name="project" value="${escapeHtml(entry?.project ?? "")}" />
        </div>
        <div class="field-group">
          <label for="status">状态</label>
          <input id="status" name="status" value="${escapeHtml(entry?.status ?? "")}" />
        </div>
      </div>
      <div class="field-group">
        <label for="links">相关链接（每行一个，格式：标签 | https://example.com）</label>
        <textarea id="links" name="links">${escapeHtml(
          (entry?.links ?? []).map((link) => `${link.label} | ${link.href}`).join("\n"),
        )}</textarea>
      </div>
      <div class="field-group">
        <label for="body">正文 Markdown</label>
        <textarea id="body" name="body">${escapeHtml(entry?.body ?? "")}</textarea>
      </div>
    `;
  }

  return `
    ${common}
    <div class="field-group">
      <label for="description">摘要</label>
      <input id="description" name="description" value="${escapeHtml(entry?.description ?? "")}" required />
    </div>
    <div class="field-group">
      <label for="cover">封面图路径</label>
      <input id="cover" name="cover" value="${escapeHtml(entry?.cover ?? "")}" required />
    </div>
    <div class="field-group">
      <label for="body">正文 Markdown</label>
      <textarea id="body" name="body">${escapeHtml(entry?.body ?? "")}</textarea>
    </div>
  `;
}

function parseFormPayload(collection, formData) {
  const payload = Object.fromEntries(formData.entries());

  payload.draft = formData.get("draft") === "on";

  if (collection === "blog") {
    payload.tags = String(payload.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (collection === "research") {
    payload.links = String(payload.links ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, href] = line.split("|").map((part) => part.trim());
        return { label, href };
      });
  }

  return payload;
}

function attachTitleSlugSync(form) {
  const titleInput = form.querySelector("#title");
  const slugInput = form.querySelector("#slug");
  if (!titleInput || !slugInput || slugInput.hasAttribute("readonly")) {
    return;
  }

  titleInput.addEventListener("input", () => {
    slugInput.value = slugify(titleInput.value);
  });
}

async function editorView(collection, slug = null) {
  const isNew = !slug;
  let entry = null;
  if (!isNew) {
    const response = await apiFetch(`/api/admin/content/${collection}/${slug}`);
    if (!response) return;
    entry = await response.json();
  }

  appEl.innerHTML = `
    <div class="admin-grid">
      <div class="admin-actions">
        <a class="link-button button-secondary" href="/admin/${collection}">返回列表</a>
      </div>
      <form id="editor-form" class="admin-form">
        ${buildEditorFields(collection, entry)}
        <div class="admin-card upload-card">
          <div class="admin-kicker">Image Upload</div>
          <p class="markdown-help">上传后会返回站内图片路径，可以设为封面或插入 Markdown。</p>
          <div class="admin-actions">
            <input id="image-file" type="file" accept="image/*" />
            <button type="button" class="link-button button-secondary" id="upload-trigger">上传图片</button>
          </div>
          <div id="upload-message" class="markdown-help" style="margin-top:0.75rem"></div>
        </div>
        <div class="admin-actions">
          <button type="submit" class="link-button button-secondary" data-action="save">保存</button>
          <button type="submit" class="link-button button-accent" data-action="publish">保存并发布</button>
        </div>
        <div id="editor-message"></div>
      </form>
    </div>
  `;

  const form = document.getElementById("editor-form");
  const messageEl = document.getElementById("editor-message");

  attachTitleSlugSync(form);

  document.getElementById("upload-trigger")?.addEventListener("click", async () => {
    const fileInput = document.getElementById("image-file");
    if (!fileInput.files?.length) {
      document.getElementById("upload-message").textContent = "请先选择图片。";
      return;
    }

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);
    formData.append("collection", collection);
    formData.append("slug", slug || form.querySelector("#slug")?.value || "draft-entry");

    const response = await apiFetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });
    if (!response) return;
    const result = await response.json();
    const uploadMessage = document.getElementById("upload-message");

    if (!response.ok) {
      uploadMessage.textContent = result.error ?? "上传失败。";
      return;
    }

    uploadMessage.innerHTML = `
      <div class="upload-result">图片路径：${escapeHtml(result.path)}</div>
      <div class="admin-actions" style="margin-top:0.5rem">
        ${form.querySelector("#cover") ? '<button type="button" class="link-button button-secondary" id="use-cover">设为封面</button>' : ""}
        <button type="button" class="link-button button-secondary" id="insert-markdown">插入正文</button>
      </div>
    `;

    document.getElementById("use-cover")?.addEventListener("click", () => {
      const cover = form.querySelector("#cover");
      if (cover) cover.value = result.path;
    });

    document.getElementById("insert-markdown")?.addEventListener("click", () => {
      const body = form.querySelector("#body");
      body.value += `\n![图片说明](${result.path})\n`;
    });
  });

  let submitAction = "save";
  form.querySelectorAll('button[type="submit"]').forEach((button) => {
    button.addEventListener("click", () => {
      submitAction = button.dataset.action;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = parseFormPayload(collection, new FormData(form));
    const method = isNew ? "POST" : "PUT";
    const endpoint = isNew
      ? `/api/admin/content/${collection}`
      : `/api/admin/content/${collection}/${slug}`;

    const saveResponse = await apiFetch(endpoint, {
      method,
      body: JSON.stringify(payload),
    });

    if (!saveResponse) return;
    const saveResult = await saveResponse.json();

    if (!saveResponse.ok) {
      messageEl.innerHTML = renderMessage(saveResult.error ?? "保存失败。", "error");
      return;
    }

    if (submitAction === "save") {
      messageEl.innerHTML = renderMessage("已保存草稿。", "success");
      if (isNew) {
        window.history.replaceState({}, "", `/admin/${collection}/${saveResult.slug}`);
      }
      return;
    }

    messageEl.innerHTML = renderMessage("正在构建并发布，请稍候……", "success");
    const publishResponse = await apiFetch("/api/admin/publish", {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (!publishResponse) return;
    const publishResult = await publishResponse.json();

    if (!publishResponse.ok) {
      messageEl.innerHTML = renderMessage(
        publishResult.error ?? publishResult.output ?? "发布失败。",
        "error",
      );
      return;
    }

    messageEl.innerHTML = renderMessage(publishResult.output ?? "发布成功。", "success");
  });
}

async function init() {
  const sessionResponse = await apiFetch("/api/admin/session");
  if (!sessionResponse) return;
  const session = await sessionResponse.json();
  if (!session.authenticated) {
    window.location.href = "/admin/login";
    return;
  }

  csrfToken = session.csrfToken;
  const pathname = window.location.pathname;
  setActiveNav(pathname);

  if (pathname === "/admin" || pathname === "/admin/") {
    dashboardView();
    return;
  }

  const parts = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const [collection, slug] = parts;

  if (parts.length === 1 && ["blog", "research", "travel"].includes(collection)) {
    await listView(collection);
    return;
  }

  if (parts.length === 2 && slug === "new") {
    await editorView(collection);
    return;
  }

  if (parts.length === 2) {
    await editorView(collection, slug);
    return;
  }

  dashboardView();
}

logoutButton.addEventListener("click", async () => {
  const response = await apiFetch("/api/admin/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (response?.ok) {
    window.location.href = "/admin/login";
  }
});

init();
