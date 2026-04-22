let csrfToken = "";
let homepageSectionTypes = [];
let homepageState = null;
let aboutState = null;
let previewTimer = null;

const appEl = document.getElementById("app");
const logoutButton = document.getElementById("logout-button");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSectionId(type) {
  return `${slugify(type)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultHomepageSection(type, order) {
  const base = {
    id: createSectionId(type),
    type,
    enabled: true,
    order,
    eyebrow: "",
    title: "",
    linkLabel: "",
    linkHref: "",
  };

  if (type === "quote") {
    return {
      ...base,
      eyebrow: "Editorial Note",
      quote: "在这里写下一段你想放在首页的重要句子。",
    };
  }

  if (type === "aboutNote") {
    return {
      ...base,
      eyebrow: "关于这里",
      body: "这里可以放一段关于站点、写作方向或近期关注主题的说明。",
      linkLabel: "查看更多",
      linkHref: "/about",
    };
  }

  if (type === "richText") {
    return {
      ...base,
      eyebrow: "Notes",
      title: "新的文字区块",
      body: "这里可以写一段自由文字。\n\n支持用空行分段。",
      linkLabel: "",
      linkHref: "",
    };
  }

  if (type === "curatedLinks") {
    return {
      ...base,
      eyebrow: "Start Here",
      title: "第一次来，可以先看这里",
      body: "如果你是第一次来到这个网站，这几篇内容能更快帮助你理解我在关心什么、这里为什么值得继续逛下去。",
      items: [
        {
          eyebrow: "写作",
          title: "先放一篇代表性文章",
          description: "用一篇最能代表你表达方式的文章，带读者进入你的语境。",
          href: "/blog",
        },
        {
          eyebrow: "研究",
          title: "再看一条研究线索",
          description: "补充你正在如何思考问题，而不只是展示结果。",
          href: "/research",
        },
        {
          eyebrow: "路上",
          title: "最后看一篇游记",
          description: "让人看到你的观察方式，不只存在于书桌前。",
          href: "/travel",
        },
      ],
    };
  }

  if (type === "nowSummary") {
    return {
      ...base,
      eyebrow: "Now",
      title: "最近在做什么",
      body: "这里放一段比正式文章更轻的近况摘要，让首页保持一点正在发生的生命感。",
      linkLabel: "查看完整近况",
      linkHref: "/now",
    };
  }

  const presets = {
    featuredPosts: {
      eyebrow: "Writing",
      title: "最近写下的东西",
      linkLabel: "查看全部文章",
      linkHref: "/blog",
      count: 3,
    },
    travelList: {
      eyebrow: "On The Road",
      title: "路上的记录",
      linkLabel: "查看游记",
      linkHref: "/travel",
      count: 3,
    },
    researchList: {
      eyebrow: "Research In Progress",
      title: "正在推进的研究",
      linkLabel: "进入研究日志",
      linkHref: "/research",
      count: 3,
    },
  };

  return {
    ...base,
    ...presets[type],
  };
}

function defaultAboutLink() {
  return {
    label: "新链接",
    href: "https://example.com/",
  };
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

function renderMessage(text = "", type = "success") {
  if (!text) {
    return "";
  }
  return `<div class="admin-message ${type}">${escapeHtml(text)}</div>`;
}

function previewMetaLabel(collection, payload) {
  if (collection === "blog") {
    return (payload.tags ?? []).slice(0, 2).join(" · ") || "Blog";
  }

  if (collection === "research") {
    return [payload.project, payload.status].filter(Boolean).join(" · ") || "Research";
  }

  return "Travel";
}

function enhancePreviewContent(root) {
  if (!root) return;

  const paragraphs = Array.from(root.querySelectorAll("p")).filter((node) => {
    if (node.children.length !== 1) return false;
    return node.firstElementChild?.tagName === "IMG";
  });

  paragraphs.forEach((paragraph) => {
    const image = paragraph.querySelector("img");
    if (!image) return;

    const figure = document.createElement("figure");
    figure.className = "preview-figure";
    const captionText = image.getAttribute("title") || image.getAttribute("alt") || "";
    paragraph.replaceWith(figure);
    figure.appendChild(image);

    if (captionText) {
      const caption = document.createElement("figcaption");
      caption.textContent = captionText;
      figure.appendChild(caption);
    }
  });

  const figures = Array.from(root.querySelectorAll(".preview-figure"));
  let group = [];

  const flushGroup = () => {
    if (group.length <= 1) {
      group = [];
      return;
    }

    const gallery = document.createElement("div");
    gallery.className = "preview-gallery";
    gallery.dataset.gallerySize = String(Math.min(group.length, 4));
    group[0].before(gallery);
    group.forEach((item) => gallery.appendChild(item));
    group = [];
  };

  figures.forEach((figure, index) => {
    const previous = figures[index - 1];
    if (!previous) {
      group.push(figure);
      return;
    }

    if (previous.nextElementSibling === figure) {
      group.push(figure);
      return;
    }

    flushGroup();
    group.push(figure);
  });

  flushGroup();
}

function renderPreviewPanel(collection, payload, previewHtml = "") {
  const host = document.getElementById("editor-preview");
  if (!host) return;

  const date = payload.date || new Date().toISOString().slice(0, 10);
  const description = payload.description || payload.summary || "这里会显示正文预览。";
  const title = payload.title || "未命名内容";
  const meta = previewMetaLabel(collection, payload);

  host.innerHTML = `
    <div class="preview-shell">
      <div class="admin-kicker">${escapeHtml(collection)}</div>
      <h3 class="preview-title">${escapeHtml(title)}</h3>
      <div class="meta-row">
        <span>${escapeHtml(date)}</span>
        <span>${escapeHtml(meta)}</span>
      </div>
      ${payload.cover ? `<img class="preview-cover" src="${escapeHtml(payload.cover)}" alt="${escapeHtml(title)}" />` : ""}
      <p class="preview-description">${escapeHtml(description)}</p>
      <div class="preview-divider"></div>
      <div class="preview-prose" id="editor-preview-prose">${previewHtml || "<p>开始输入正文后，这里会实时更新。</p>"}</div>
    </div>
  `;

  enhancePreviewContent(document.getElementById("editor-preview-prose"));
}

async function refreshPreview(form, collection) {
  const payload = parseFormPayload(collection, new FormData(form));
  renderPreviewPanel(collection, payload);

  const response = await apiFetch("/api/admin/preview", {
    method: "POST",
    body: JSON.stringify({ body: payload.body ?? "" }),
  });
  if (!response) return;

  const result = await response.json();
  if (!response.ok) {
    return;
  }

  renderPreviewPanel(collection, payload, result.html);
}

function schedulePreview(form, collection) {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    refreshPreview(form, collection);
  }, 220);
}

async function publishSite() {
  const publishResponse = await apiFetch("/api/admin/publish", {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (!publishResponse) {
    return { ok: false, error: "发布请求失败。" };
  }

  const publishResult = await publishResponse.json();
  if (!publishResponse.ok) {
    return {
      ok: false,
      error: publishResult.error ?? publishResult.output ?? "发布失败。",
    };
  }

  return {
    ok: true,
    output: publishResult.output ?? "发布成功。",
  };
}

function dashboardView() {
  appEl.innerHTML = `
    <div class="admin-grid">
      <section>
        <div class="admin-kicker">Overview</div>
        <h2 class="admin-title" style="font-size:2.1rem">从这里管理首页、关于我、内容和图片</h2>
        <p class="markdown-help">现在支持首页配置、关于我、博客、科研进展、游记的编辑，正文实时预览，以及回收站查看、恢复与存档。</p>
      </section>
      <div class="admin-grid two">
        <a class="admin-card upload-card" href="/admin/homepage">
          <div class="admin-kicker">Homepage</div>
          <h3>管理首页</h3>
          <p class="markdown-help">修改首屏文字，增删预设首页板块，并调整显示顺序。</p>
        </a>
        <a class="admin-card upload-card" href="/admin/about">
          <div class="admin-kicker">About</div>
          <h3>管理关于我</h3>
          <p class="markdown-help">编辑关于页文案、Quick Facts 和外部链接。</p>
        </a>
        <a class="admin-card upload-card" href="/admin/trash">
          <div class="admin-kicker">Trash</div>
          <h3>查看回收站</h3>
          <p class="markdown-help">查看被删除内容，恢复或存档它们。</p>
        </a>
        <a class="admin-card upload-card" href="/admin/blog">
          <div class="admin-kicker">Blog</div>
          <h3>管理博客</h3>
          <p class="markdown-help">新增、修改或移入回收区，支持封面图和 Markdown 正文。</p>
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

async function listView(collection, messageHtml = "") {
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
      <div id="list-message">${messageHtml}</div>
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
              <div class="admin-actions">
                <a class="link-button button-secondary" href="/admin/${collection}/${item.slug}">编辑</a>
                <button class="link-button button-danger" type="button" data-delete-slug="${escapeHtml(item.slug)}">删除</button>
              </div>
            </article>`,
          )
          .join("")}
      </div>
    </div>
  `;

  const messageEl = document.getElementById("list-message");
  appEl.querySelectorAll("[data-delete-slug]").forEach((button) => {
    button.addEventListener("click", async () => {
      const slug = button.getAttribute("data-delete-slug");
      if (!slug) return;
      const confirmed = window.confirm("这篇内容会被移到回收区，并重新发布站点。要继续吗？");
      if (!confirmed) return;

      messageEl.innerHTML = renderMessage("正在移到回收区并发布，请稍候……", "success");
      const deleteResponse = await apiFetch(`/api/admin/content/${collection}/${slug}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });

      if (!deleteResponse) return;
      const deleteResult = await deleteResponse.json();
      if (!deleteResponse.ok) {
        messageEl.innerHTML = renderMessage(deleteResult.error ?? "删除失败。", "error");
        return;
      }

      const publishResult = await publishSite();
      if (!publishResult.ok) {
        messageEl.innerHTML = renderMessage(publishResult.error, "error");
        return;
      }

      await listView(collection, renderMessage("已移到回收区并完成发布。", "success"));
    });
  });
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
    <div class="editor-layout">
      <div class="admin-actions">
        <a class="link-button button-secondary" href="/admin/${collection}">返回列表</a>
      </div>
      <form id="editor-form" class="admin-form">
        ${buildEditorFields(collection, entry)}
        <div class="admin-card upload-card">
          <div class="admin-kicker">Image Upload</div>
          <p class="markdown-help">上传后会返回站内图片路径，可以设为封面或插入 Markdown。连续插入多张图片会在详情页自动整理成图组。</p>
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
      <aside class="admin-card upload-card preview-panel">
        <div class="admin-kicker">Live Preview</div>
        <p class="markdown-help">会根据当前表单实时渲染 Markdown、封面与多图排布。</p>
        <div id="editor-preview"></div>
      </aside>
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
      body.value += `\n![图片说明](${result.path} "图片说明")\n`;
      schedulePreview(form, collection);
    });
  });

  form.addEventListener("input", () => {
    schedulePreview(form, collection);
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
      messageEl.innerHTML = renderMessage("已保存内容。", "success");
      if (isNew) {
        window.history.replaceState({}, "", `/admin/${collection}/${saveResult.slug}`);
      }
      return;
    }

    messageEl.innerHTML = renderMessage("正在构建并发布，请稍候……", "success");
    const publishResult = await publishSite();
    if (!publishResult.ok) {
      messageEl.innerHTML = renderMessage(publishResult.error, "error");
      return;
    }

    messageEl.innerHTML = renderMessage(publishResult.output, "success");
  });

  schedulePreview(form, collection);
}

function renderHomepageSectionFields(section) {
  const typeLabelMap = {
    featuredPosts: "博客列表",
    travelList: "游记列表",
    researchList: "科研列表",
    curatedLinks: "精选入口",
    nowSummary: "Now 摘要",
    aboutNote: "说明卡片",
    quote: "引用块",
    richText: "自由文字",
  };

  const common = `
    <div class="admin-grid two">
      <div class="field-group">
        <label>区块 ID</label>
        <input data-homepage-field="id" value="${escapeHtml(section.id)}" required />
      </div>
      <div class="field-group">
        <label>类型</label>
        <input value="${escapeHtml(typeLabelMap[section.type] ?? section.type)}" readonly />
      </div>
    </div>
    <div class="admin-grid two">
      <div class="field-group">
        <label>Eyebrow</label>
        <input data-homepage-field="eyebrow" value="${escapeHtml(section.eyebrow ?? "")}" />
      </div>
      <div class="field-group field-inline" style="padding-top:2rem">
        <input data-homepage-field="enabled" type="checkbox" ${section.enabled ? "checked" : ""} />
        <label>启用这个板块</label>
      </div>
    </div>
  `;

  if (["featuredPosts", "travelList", "researchList"].includes(section.type)) {
    return `
      ${common}
      <div class="admin-grid two">
        <div class="field-group">
          <label>标题</label>
          <input data-homepage-field="title" value="${escapeHtml(section.title ?? "")}" />
        </div>
        <div class="field-group">
          <label>显示数量</label>
          <input data-homepage-field="count" type="number" min="1" max="12" value="${escapeHtml(String(section.count ?? 3))}" />
        </div>
      </div>
      <div class="admin-grid two">
        <div class="field-group">
          <label>链接文案</label>
          <input data-homepage-field="linkLabel" value="${escapeHtml(section.linkLabel ?? "")}" />
        </div>
        <div class="field-group">
          <label>链接地址</label>
          <input data-homepage-field="linkHref" value="${escapeHtml(section.linkHref ?? "")}" />
        </div>
      </div>
    `;
  }

  if (section.type === "quote") {
    return `
      ${common}
      <div class="field-group">
        <label>引用文字</label>
        <textarea data-homepage-field="quote">${escapeHtml(section.quote ?? "")}</textarea>
      </div>
    `;
  }

  if (section.type === "curatedLinks") {
    return `
      ${common}
      <div class="field-group">
        <label>标题</label>
        <input data-homepage-field="title" value="${escapeHtml(section.title ?? "")}" />
      </div>
      <div class="field-group">
        <label>引导说明</label>
        <textarea data-homepage-field="body">${escapeHtml(section.body ?? "")}</textarea>
      </div>
      <div class="admin-grid">
        ${(section.items ?? [])
          .map(
            (item, index) => `
              <div class="admin-card homepage-section-card" data-curated-item>
                <div class="admin-actions admin-actions--spread">
                  <div>
                    <div class="admin-kicker">入口 ${index + 1}</div>
                    <h4 class="admin-subtitle">${escapeHtml(item.title || "未命名入口")}</h4>
                  </div>
                  <button type="button" class="link-button button-danger" data-remove-curated-item="${index}">删除入口</button>
                </div>
                <div class="admin-grid two">
                  <div class="field-group">
                    <label>分类眉题</label>
                    <input data-curated-field="eyebrow" value="${escapeHtml(item.eyebrow ?? "")}" />
                  </div>
                  <div class="field-group">
                    <label>标题</label>
                    <input data-curated-field="title" value="${escapeHtml(item.title ?? "")}" />
                  </div>
                </div>
                <div class="field-group">
                  <label>描述</label>
                  <textarea data-curated-field="description">${escapeHtml(item.description ?? "")}</textarea>
                </div>
                <div class="field-group">
                  <label>链接地址</label>
                  <input data-curated-field="href" value="${escapeHtml(item.href ?? "")}" />
                </div>
              </div>`,
          )
          .join("")}
      </div>
      <div class="admin-actions">
        <button type="button" class="link-button button-secondary" data-add-curated-item>新增精选入口</button>
      </div>
    `;
  }

  return `
    ${common}
    <div class="field-group">
      <label>标题</label>
      <input data-homepage-field="title" value="${escapeHtml(section.title ?? "")}" />
    </div>
    <div class="field-group">
      <label>正文</label>
      <textarea data-homepage-field="body">${escapeHtml(section.body ?? "")}</textarea>
    </div>
    <div class="admin-grid two">
      <div class="field-group">
        <label>链接文案</label>
        <input data-homepage-field="linkLabel" value="${escapeHtml(section.linkLabel ?? "")}" />
      </div>
      <div class="field-group">
        <label>链接地址</label>
        <input data-homepage-field="linkHref" value="${escapeHtml(section.linkHref ?? "")}" />
      </div>
    </div>
  `;
}

function syncHomepageStateFromDom() {
  const form = document.getElementById("homepage-form");
  if (!form || !homepageState) return;

  homepageState.hero = {
    id: form.querySelector('[data-homepage-hero="id"]').value.trim(),
    eyebrow: form.querySelector('[data-homepage-hero="eyebrow"]').value.trim(),
    title: form.querySelector('[data-homepage-hero="title"]').value.trim(),
    intro: form.querySelector('[data-homepage-hero="intro"]').value.trim(),
    note: form.querySelector('[data-homepage-hero="note"]')?.value.trim() ?? "",
    primaryLinkLabel: form.querySelector('[data-homepage-hero="primaryLinkLabel"]')?.value.trim() ?? "",
    primaryLinkHref: form.querySelector('[data-homepage-hero="primaryLinkHref"]')?.value.trim() ?? "",
    secondaryLinkLabel: form.querySelector('[data-homepage-hero="secondaryLinkLabel"]')?.value.trim() ?? "",
    secondaryLinkHref: form.querySelector('[data-homepage-hero="secondaryLinkHref"]')?.value.trim() ?? "",
  };

  homepageState.sections = Array.from(form.querySelectorAll("[data-homepage-section]")).map((card, index) => {
    const type = card.getAttribute("data-section-type");
    const section = {
      id: card.querySelector('[data-homepage-field="id"]').value.trim(),
      type,
      enabled: card.querySelector('[data-homepage-field="enabled"]').checked,
      order: (index + 1) * 10,
      eyebrow: card.querySelector('[data-homepage-field="eyebrow"]').value.trim(),
      title: card.querySelector('[data-homepage-field="title"]')?.value.trim() ?? "",
      linkLabel: card.querySelector('[data-homepage-field="linkLabel"]')?.value.trim() ?? "",
      linkHref: card.querySelector('[data-homepage-field="linkHref"]')?.value.trim() ?? "",
    };

    if (["featuredPosts", "travelList", "researchList"].includes(type)) {
      section.count = Number(card.querySelector('[data-homepage-field="count"]').value || 3);
    }

    if (type === "curatedLinks") {
      section.body = card.querySelector('[data-homepage-field="body"]').value.trim();
      section.items = Array.from(card.querySelectorAll("[data-curated-item]")).map((itemCard) => ({
        eyebrow: itemCard.querySelector('[data-curated-field="eyebrow"]').value.trim(),
        title: itemCard.querySelector('[data-curated-field="title"]').value.trim(),
        description: itemCard.querySelector('[data-curated-field="description"]').value.trim(),
        href: itemCard.querySelector('[data-curated-field="href"]').value.trim(),
      }));
    }

    if (type === "quote") {
      section.quote = card.querySelector('[data-homepage-field="quote"]').value.trim();
    }

    if (["aboutNote", "richText", "nowSummary"].includes(type)) {
      section.body = card.querySelector('[data-homepage-field="body"]').value.trim();
    }

    return section;
  });
}

function renderHomepageEditor(messageHtml = "") {
  if (!homepageState) return;

  appEl.innerHTML = `
    <div class="admin-grid">
      <form id="homepage-form" class="admin-form">
        <div class="admin-card upload-card">
          <div class="admin-kicker">Hero</div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>Hero ID</label>
              <input data-homepage-hero="id" value="${escapeHtml(homepageState.hero.id)}" required />
            </div>
            <div class="field-group">
              <label>Eyebrow</label>
              <input data-homepage-hero="eyebrow" value="${escapeHtml(homepageState.hero.eyebrow ?? "")}" />
            </div>
          </div>
          <div class="field-group">
            <label>主标题</label>
            <textarea data-homepage-hero="title">${escapeHtml(homepageState.hero.title)}</textarea>
          </div>
          <div class="field-group">
            <label>简介</label>
            <textarea data-homepage-hero="intro">${escapeHtml(homepageState.hero.intro)}</textarea>
          </div>
          <div class="field-group">
            <label>补充说明</label>
            <textarea data-homepage-hero="note">${escapeHtml(homepageState.hero.note ?? "")}</textarea>
          </div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>主链接文案</label>
              <input data-homepage-hero="primaryLinkLabel" value="${escapeHtml(homepageState.hero.primaryLinkLabel ?? "")}" />
            </div>
            <div class="field-group">
              <label>主链接地址</label>
              <input data-homepage-hero="primaryLinkHref" value="${escapeHtml(homepageState.hero.primaryLinkHref ?? "")}" />
            </div>
          </div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>次链接文案</label>
              <input data-homepage-hero="secondaryLinkLabel" value="${escapeHtml(homepageState.hero.secondaryLinkLabel ?? "")}" />
            </div>
            <div class="field-group">
              <label>次链接地址</label>
              <input data-homepage-hero="secondaryLinkHref" value="${escapeHtml(homepageState.hero.secondaryLinkHref ?? "")}" />
            </div>
          </div>
        </div>

        <div class="admin-card upload-card">
          <div class="admin-kicker">Sections</div>
          <p class="markdown-help">可以新增、排序、隐藏或删除首页预设板块。删除只影响首页配置，不会删除文章内容。</p>
          <div class="admin-actions">
            ${homepageSectionTypes
              .map(
                (type) => `
                  <button type="button" class="link-button button-secondary" data-add-section="${type}">
                    新增 ${escapeHtml(type)}
                  </button>`,
              )
              .join("")}
          </div>
        </div>

        <div class="admin-grid" id="homepage-section-list">
          ${homepageState.sections
            .map(
              (section, index) => `
                <section class="admin-card upload-card homepage-section-card" data-homepage-section data-section-type="${escapeHtml(section.type)}">
                  <div class="admin-actions admin-actions--spread">
                    <div>
                      <div class="admin-kicker">Section ${index + 1}</div>
                      <h3 class="admin-subtitle">${escapeHtml(section.title || section.eyebrow || section.type)}</h3>
                    </div>
                    <div class="admin-actions">
                      <button type="button" class="link-button button-secondary" data-move-section="up" data-section-index="${index}">上移</button>
                      <button type="button" class="link-button button-secondary" data-move-section="down" data-section-index="${index}">下移</button>
                      <button type="button" class="link-button button-danger" data-remove-section="${index}">删除板块</button>
                    </div>
                  </div>
                  ${renderHomepageSectionFields(section)}
                </section>`,
            )
            .join("")}
        </div>

        <div class="admin-actions">
          <button type="submit" class="link-button button-secondary" data-action="save">保存首页配置</button>
          <button type="submit" class="link-button button-accent" data-action="publish">保存并发布首页</button>
        </div>
        <div id="homepage-message">${messageHtml}</div>
      </form>
    </div>
  `;

  const form = document.getElementById("homepage-form");
  const messageEl = document.getElementById("homepage-message");
  let submitAction = "save";

  form.querySelectorAll('[data-action="save"], [data-action="publish"]').forEach((button) => {
    button.addEventListener("click", () => {
      submitAction = button.dataset.action;
    });
  });

  form.querySelectorAll("[data-add-section]").forEach((button) => {
    button.addEventListener("click", () => {
      syncHomepageStateFromDom();
      const type = button.getAttribute("data-add-section");
      homepageState.sections.push(defaultHomepageSection(type, (homepageState.sections.length + 1) * 10));
      renderHomepageEditor(renderMessage("已新增一个预设板块，记得保存。", "success"));
    });
  });

  form.querySelectorAll("[data-add-curated-item]").forEach((button) => {
    button.addEventListener("click", () => {
      syncHomepageStateFromDom();
      const sectionCard = button.closest("[data-homepage-section]");
      const index = Array.from(form.querySelectorAll("[data-homepage-section]")).indexOf(sectionCard);
      if (index < 0) return;
      const section = homepageState.sections[index];
      if (!section || section.type !== "curatedLinks") return;
      section.items = section.items ?? [];
      section.items.push({
        eyebrow: "",
        title: "新的精选入口",
        description: "写一句告诉第一次访问者，为什么应该点开它。",
        href: "/blog",
      });
      renderHomepageEditor(renderMessage("已新增一个精选入口，记得保存。", "success"));
    });
  });

  form.querySelectorAll("[data-remove-curated-item]").forEach((button) => {
    button.addEventListener("click", () => {
      syncHomepageStateFromDom();
      const itemIndex = Number(button.getAttribute("data-remove-curated-item"));
      const sectionCard = button.closest("[data-homepage-section]");
      const index = Array.from(form.querySelectorAll("[data-homepage-section]")).indexOf(sectionCard);
      if (index < 0) return;
      const section = homepageState.sections[index];
      if (!section || section.type !== "curatedLinks") return;
      section.items.splice(itemIndex, 1);
      renderHomepageEditor(renderMessage("已移除一个精选入口，记得保存。", "success"));
    });
  });

  form.querySelectorAll("[data-move-section]").forEach((button) => {
    button.addEventListener("click", () => {
      syncHomepageStateFromDom();
      const index = Number(button.getAttribute("data-section-index"));
      const direction = button.getAttribute("data-move-section");
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= homepageState.sections.length) {
        return;
      }
      const [section] = homepageState.sections.splice(index, 1);
      homepageState.sections.splice(targetIndex, 0, section);
      renderHomepageEditor();
    });
  });

  form.querySelectorAll("[data-remove-section]").forEach((button) => {
    button.addEventListener("click", () => {
      syncHomepageStateFromDom();
      const index = Number(button.getAttribute("data-remove-section"));
      homepageState.sections.splice(index, 1);
      renderHomepageEditor(renderMessage("板块已从首页配置中移除，记得保存。", "success"));
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncHomepageStateFromDom();

    const saveResponse = await apiFetch("/api/admin/homepage", {
      method: "PUT",
      body: JSON.stringify(homepageState),
    });

    if (!saveResponse) return;
    const saveResult = await saveResponse.json();

    if (!saveResponse.ok) {
      messageEl.innerHTML = renderMessage(saveResult.error ?? "保存首页配置失败。", "error");
      return;
    }

    homepageState = saveResult.homepage;

    if (submitAction === "save") {
      renderHomepageEditor(renderMessage("首页配置已保存。", "success"));
      return;
    }

    messageEl.innerHTML = renderMessage("首页配置已保存，正在构建并发布……", "success");
    const publishResult = await publishSite();
    if (!publishResult.ok) {
      messageEl.innerHTML = renderMessage(publishResult.error, "error");
      return;
    }

    renderHomepageEditor(renderMessage(publishResult.output, "success"));
  });
}

async function homepageView() {
  const response = await apiFetch("/api/admin/homepage");
  if (!response) return;
  const result = await response.json();
  if (!response.ok) {
    appEl.innerHTML = renderMessage(result.error ?? "加载首页配置失败。", "error");
    return;
  }

  homepageState = result.homepage;
  if (Array.isArray(result.sectionTypes) && result.sectionTypes.length > 0) {
    homepageSectionTypes = result.sectionTypes;
  }
  renderHomepageEditor();
}

function syncAboutStateFromDom() {
  const form = document.getElementById("about-form");
  if (!form || !aboutState) return;

  aboutState.hero = {
    eyebrow: form.querySelector('[data-about-hero="eyebrow"]').value.trim(),
    title: form.querySelector('[data-about-hero="title"]').value.trim(),
    intro: form.querySelector('[data-about-hero="intro"]').value.trim(),
  };

  aboutState.profileCard = {
    sectionLabel: form.querySelector('[data-about-profile="sectionLabel"]').value.trim(),
    title: form.querySelector('[data-about-profile="title"]').value.trim(),
    body: form.querySelector('[data-about-profile="body"]').value.trim(),
    secondaryBody: form.querySelector('[data-about-profile="secondaryBody"]').value.trim(),
  };

  aboutState.facts = {
    sectionLabel: form.querySelector('[data-about-facts="sectionLabel"]').value.trim(),
    locationLabel: form.querySelector('[data-about-facts="locationLabel"]').value.trim(),
    location: form.querySelector('[data-about-facts="location"]').value.trim(),
    emailLabel: form.querySelector('[data-about-facts="emailLabel"]').value.trim(),
    email: form.querySelector('[data-about-facts="email"]').value.trim(),
    topicsLabel: form.querySelector('[data-about-facts="topicsLabel"]').value.trim(),
    topics: form.querySelector('[data-about-facts="topics"]').value.trim(),
  };

  aboutState.links = Array.from(form.querySelectorAll("[data-about-link]")).map((item) => ({
    label: item.querySelector('[data-link-field="label"]').value.trim(),
    href: item.querySelector('[data-link-field="href"]').value.trim(),
  }));
}

function renderAboutEditor(messageHtml = "") {
  if (!aboutState) return;

  appEl.innerHTML = `
    <div class="admin-grid">
      <form id="about-form" class="admin-form">
        <div class="admin-card upload-card">
          <div class="admin-kicker">Hero</div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>Eyebrow</label>
              <input data-about-hero="eyebrow" value="${escapeHtml(aboutState.hero.eyebrow ?? "")}" />
            </div>
            <div class="field-group">
              <label>标题</label>
              <input data-about-hero="title" value="${escapeHtml(aboutState.hero.title)}" />
            </div>
          </div>
          <div class="field-group">
            <label>导语</label>
            <textarea data-about-hero="intro">${escapeHtml(aboutState.hero.intro)}</textarea>
          </div>
        </div>

        <div class="admin-card upload-card">
          <div class="admin-kicker">Profile Card</div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>Section Label</label>
              <input data-about-profile="sectionLabel" value="${escapeHtml(aboutState.profileCard.sectionLabel ?? "")}" />
            </div>
            <div class="field-group">
              <label>卡片标题</label>
              <input data-about-profile="title" value="${escapeHtml(aboutState.profileCard.title)}" />
            </div>
          </div>
          <div class="field-group">
            <label>正文</label>
            <textarea data-about-profile="body">${escapeHtml(aboutState.profileCard.body)}</textarea>
          </div>
          <div class="field-group">
            <label>补充说明</label>
            <textarea data-about-profile="secondaryBody">${escapeHtml(aboutState.profileCard.secondaryBody ?? "")}</textarea>
          </div>
        </div>

        <div class="admin-card upload-card">
          <div class="admin-kicker">Quick Facts</div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>Section Label</label>
              <input data-about-facts="sectionLabel" value="${escapeHtml(aboutState.facts.sectionLabel ?? "")}" />
            </div>
            <div class="field-group">
              <label>地点标签</label>
              <input data-about-facts="locationLabel" value="${escapeHtml(aboutState.facts.locationLabel ?? "")}" />
            </div>
          </div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>地点</label>
              <input data-about-facts="location" value="${escapeHtml(aboutState.facts.location ?? "")}" />
            </div>
            <div class="field-group">
              <label>联系标签</label>
              <input data-about-facts="emailLabel" value="${escapeHtml(aboutState.facts.emailLabel ?? "")}" />
            </div>
          </div>
          <div class="admin-grid two">
            <div class="field-group">
              <label>邮箱 / 联系方式</label>
              <input data-about-facts="email" value="${escapeHtml(aboutState.facts.email ?? "")}" />
            </div>
            <div class="field-group">
              <label>主题标签</label>
              <input data-about-facts="topicsLabel" value="${escapeHtml(aboutState.facts.topicsLabel ?? "")}" />
            </div>
          </div>
          <div class="field-group">
            <label>关注主题</label>
            <textarea data-about-facts="topics">${escapeHtml(aboutState.facts.topics ?? "")}</textarea>
          </div>
        </div>

        <div class="admin-card upload-card">
          <div class="admin-kicker">Links</div>
          <div class="admin-actions">
            <button type="button" class="link-button button-secondary" id="add-about-link">新增外部链接</button>
          </div>
          <div class="admin-grid" id="about-links-list">
            ${aboutState.links
              .map(
                (link, index) => `
                  <div class="admin-card homepage-section-card" data-about-link>
                    <div class="admin-actions admin-actions--spread">
                      <div>
                        <div class="admin-kicker">Link ${index + 1}</div>
                      </div>
                      <button type="button" class="link-button button-danger" data-remove-about-link="${index}">删除链接</button>
                    </div>
                    <div class="admin-grid two">
                      <div class="field-group">
                        <label>标签</label>
                        <input data-link-field="label" value="${escapeHtml(link.label)}" />
                      </div>
                      <div class="field-group">
                        <label>链接地址</label>
                        <input data-link-field="href" value="${escapeHtml(link.href)}" />
                      </div>
                    </div>
                  </div>`,
              )
              .join("")}
          </div>
        </div>

        <div class="admin-actions">
          <button type="submit" class="link-button button-secondary" data-action="save">保存关于我</button>
          <button type="submit" class="link-button button-accent" data-action="publish">保存并发布关于我</button>
        </div>
        <div id="about-message">${messageHtml}</div>
      </form>
    </div>
  `;

  const form = document.getElementById("about-form");
  const messageEl = document.getElementById("about-message");
  let submitAction = "save";

  form.querySelectorAll('[data-action="save"], [data-action="publish"]').forEach((button) => {
    button.addEventListener("click", () => {
      submitAction = button.dataset.action;
    });
  });

  document.getElementById("add-about-link")?.addEventListener("click", () => {
    syncAboutStateFromDom();
    aboutState.links.push(defaultAboutLink());
    renderAboutEditor(renderMessage("已新增一个外部链接表单。", "success"));
  });

  form.querySelectorAll("[data-remove-about-link]").forEach((button) => {
    button.addEventListener("click", () => {
      syncAboutStateFromDom();
      const index = Number(button.getAttribute("data-remove-about-link"));
      aboutState.links.splice(index, 1);
      renderAboutEditor(renderMessage("外部链接已移除，记得保存。", "success"));
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncAboutStateFromDom();

    const saveResponse = await apiFetch("/api/admin/about", {
      method: "PUT",
      body: JSON.stringify(aboutState),
    });
    if (!saveResponse) return;
    const saveResult = await saveResponse.json();

    if (!saveResponse.ok) {
      messageEl.innerHTML = renderMessage(saveResult.error ?? "保存关于我失败。", "error");
      return;
    }

    aboutState = saveResult.about;

    if (submitAction === "save") {
      renderAboutEditor(renderMessage("关于我已保存。", "success"));
      return;
    }

    const publishResult = await publishSite();
    if (!publishResult.ok) {
      messageEl.innerHTML = renderMessage(publishResult.error, "error");
      return;
    }

    renderAboutEditor(renderMessage(publishResult.output, "success"));
  });
}

async function aboutView() {
  const response = await apiFetch("/api/admin/about");
  if (!response) return;
  const result = await response.json();
  if (!response.ok) {
    appEl.innerHTML = renderMessage(result.error ?? "加载关于我失败。", "error");
    return;
  }

  aboutState = result.about;
  renderAboutEditor();
}

function renderTrashTabs(view) {
  return `
    <div class="admin-actions">
      <button type="button" class="link-button ${view === "active" ? "button-accent" : "button-secondary"}" data-trash-view="active">回收中</button>
      <button type="button" class="link-button ${view === "archived" ? "button-accent" : "button-secondary"}" data-trash-view="archived">已存档</button>
    </div>
  `;
}

async function trashView(view = "active", messageHtml = "") {
  const response = await apiFetch(`/api/admin/trash?view=${view}`);
  if (!response) return;
  const result = await response.json();
  if (!response.ok) {
    appEl.innerHTML = renderMessage(result.error ?? "加载回收站失败。", "error");
    return;
  }

  appEl.innerHTML = `
    <div class="admin-grid">
      <div id="trash-message">${messageHtml}</div>
      ${renderTrashTabs(result.view)}
      <div class="admin-list">
        ${
          result.items.length === 0
            ? `<div class="admin-card upload-card"><p class="markdown-help">这个视图里暂时没有内容。</p></div>`
            : result.items
                .map(
                  (item) => `
                    <article class="admin-list-item">
                      <div>
                        <div class="meta-row">
                          <span>${escapeHtml(item.collection)}</span>
                          <span>${escapeHtml(new Date(item.deletedAt).toLocaleString("zh-CN"))}</span>
                          <span>${escapeHtml(item.status)}</span>
                        </div>
                        <h3>${escapeHtml(item.title)}</h3>
                        <p class="markdown-help">slug: ${escapeHtml(item.slug)}</p>
                        <p class="markdown-help">来源: ${escapeHtml(item.sourcePath)}</p>
                        <p class="markdown-help">当前位置: ${escapeHtml(item.currentPath)}</p>
                      </div>
                      <div class="admin-actions">
                        <button type="button" class="link-button button-secondary" data-trash-restore="${escapeHtml(item.id)}">恢复</button>
                        ${
                          item.status === "active"
                            ? `<button type="button" class="link-button button-secondary" data-trash-archive="${escapeHtml(item.id)}">存档</button>`
                            : ""
                        }
                      </div>
                    </article>`,
                )
                .join("")
        }
      </div>
    </div>
  `;

  appEl.querySelectorAll("[data-trash-view]").forEach((button) => {
    button.addEventListener("click", () => {
      trashView(button.getAttribute("data-trash-view"));
    });
  });

  const messageEl = document.getElementById("trash-message");

  appEl.querySelectorAll("[data-trash-restore]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-trash-restore");
      if (!id) return;

      messageEl.innerHTML = renderMessage("正在恢复并发布，请稍候……", "success");
      const restoreResponse = await apiFetch(`/api/admin/trash/${id}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!restoreResponse) return;
      const restoreResult = await restoreResponse.json();
      if (!restoreResponse.ok) {
        messageEl.innerHTML = renderMessage(restoreResult.error ?? "恢复失败。", "error");
        return;
      }

      const publishResult = await publishSite();
      if (!publishResult.ok) {
        messageEl.innerHTML = renderMessage(publishResult.error, "error");
        return;
      }

      await trashView(view, renderMessage("内容已恢复并完成发布。", "success"));
    });
  });

  appEl.querySelectorAll("[data-trash-archive]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-trash-archive");
      if (!id) return;

      messageEl.innerHTML = renderMessage("正在存档并发布，请稍候……", "success");
      const archiveResponse = await apiFetch(`/api/admin/trash/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!archiveResponse) return;
      const archiveResult = await archiveResponse.json();
      if (!archiveResponse.ok) {
        messageEl.innerHTML = renderMessage(archiveResult.error ?? "存档失败。", "error");
        return;
      }

      const publishResult = await publishSite();
      if (!publishResult.ok) {
        messageEl.innerHTML = renderMessage(publishResult.error, "error");
        return;
      }

      await trashView(view, renderMessage("内容已存档并完成发布。", "success"));
    });
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
  if (Array.isArray(session.homepageSectionTypes) && session.homepageSectionTypes.length > 0) {
    homepageSectionTypes = session.homepageSectionTypes;
  }

  const pathname = window.location.pathname;
  setActiveNav(pathname);

  if (pathname === "/admin" || pathname === "/admin/") {
    dashboardView();
    return;
  }

  if (pathname === "/admin/homepage") {
    await homepageView();
    return;
  }

  if (pathname === "/admin/about") {
    await aboutView();
    return;
  }

  if (pathname === "/admin/trash") {
    await trashView();
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
