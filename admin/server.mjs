import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { marked } from "marked";
import {
  adminPasswordHash,
  adminPort,
  adminUsername,
  aboutConfigPath,
  collections,
  ensureRuntimeSetup,
  homepageSectionTypes,
  maxUploadBytes,
  projectRoot,
  publicImageRoot,
  publishLockPath,
  runtimeDir,
  securityStorePath,
  sessionsStorePath,
  staticDir,
  trashIndexPath,
} from "./lib/config.mjs";
import {
  archiveTrashedContent,
  createContent,
  getContent,
  listContent,
  restoreTrashedContent,
  trashContent,
  updateContent,
} from "./lib/content.mjs";
import { getAboutConfig, updateAboutConfig } from "./lib/about.mjs";
import { getHomepageConfig, updateHomepageConfig } from "./lib/homepage.mjs";
import { createJsonStore } from "./lib/store.mjs";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  clearLoginFailures,
  createSession,
  destroySession,
  getClientIp,
  getLockStatus,
  getSessionFromRequest,
  recordLoginFailure,
} from "./lib/security.mjs";

ensureRuntimeSetup();

const app = express();
const securityStore = createJsonStore(securityStorePath, {});
const sessionsStore = createJsonStore(sessionsStorePath, {});
const trashStore = createJsonStore(trashIndexPath, []);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadBytes,
  },
});

function jsonError(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

function getTrashEntries(view = "active") {
  const items = trashStore.read();
  return items
    .filter((item) => item.status === view)
    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

function updateTrashEntry(id, updater) {
  const items = trashStore.read();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    throw new Error("Trash item not found.");
  }

  const updated = updater(items[index]);
  if (updated === null) {
    items.splice(index, 1);
  } else {
    items[index] = updated;
  }
  trashStore.write(items);
  return updated;
}

function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req, sessionsStore);
  if (!session) {
    return jsonError(res, 401, "Authentication required.");
  }

  req.adminSession = session;
  return next();
}

function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const token = req.headers["x-csrf-token"];
  if (!req.adminSession || token !== req.adminSession.csrfToken) {
    return jsonError(res, 403, "Invalid CSRF token.");
  }

  return next();
}

function safeImageSegment(value, fallback = "draft-entry") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || fallback;
}

function inferImageExtension(mimetype, originalName) {
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };

  if (map[mimetype]) {
    return map[mimetype];
  }

  const ext = path.extname(originalName).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }

  return null;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      ...options,
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

async function runPublish() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  let lockHandle;

  try {
    lockHandle = fs.openSync(publishLockPath, "wx");
  } catch (_error) {
    return {
      ok: false,
      status: 409,
      output: "已有发布任务正在进行，请稍后再试。",
    };
  }

  try {
    const result = await spawnCommand("bash", ["scripts/publish-content.sh"]);
    if (result.code !== 0) {
      return {
        ok: false,
        status: 500,
        output: result.output.trim() || "发布失败。",
      };
    }

    return {
      ok: true,
      status: 200,
      output: result.output.trim() || "发布成功。",
    };
  } finally {
    fs.closeSync(lockHandle);
    fs.unlinkSync(publishLockPath);
  }
}

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
  }
  next();
});

app.use("/admin/assets", express.static(staticDir));

app.get("/api/admin/session", (req, res) => {
  const session = getSessionFromRequest(req, sessionsStore);
  if (!session) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    username: session.username,
    csrfToken: session.csrfToken,
    homepageSectionTypes,
    hasAboutConfig: fs.existsSync(aboutConfigPath),
  });
});

app.post("/api/admin/login", async (req, res) => {
  const { username = "", password = "" } = req.body ?? {};
  const clientIp = getClientIp(req);
  const lockStatus = getLockStatus(securityStore, clientIp, String(username));

  if (lockStatus) {
    return res.status(429).json({
      ok: false,
      error: `登录已被临时锁定，请在约 ${Math.ceil(lockStatus.remainingMs / 3600000)} 小时后再试。`,
    });
  }

  const usernameMatches = username === adminUsername;
  const passwordMatches = usernameMatches
    ? await bcrypt.compare(password, adminPasswordHash)
    : false;

  if (!usernameMatches || !passwordMatches) {
    recordLoginFailure(securityStore, clientIp, String(username));
    return jsonError(res, 401, "用户名或密码错误。");
  }

  clearLoginFailures(securityStore, clientIp, String(username));
  const session = createSession(sessionsStore, adminUsername);
  res.setHeader("Set-Cookie", buildSessionCookie(session.token));
  return res.json({ ok: true });
});

app.post("/api/admin/logout", requireAuth, requireCsrf, (req, res) => {
  destroySession(sessionsStore, req.adminSession.token);
  res.setHeader("Set-Cookie", buildExpiredSessionCookie());
  return res.json({ ok: true });
});

app.get("/api/admin/content/:collection", requireAuth, (req, res) => {
  try {
    return res.json({ items: listContent(req.params.collection) });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.get("/api/admin/content/:collection/:slug", requireAuth, (req, res) => {
  try {
    const item = getContent(req.params.collection, req.params.slug);
    if (!item) {
      return jsonError(res, 404, "Content entry not found.");
    }

    return res.json(item);
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.post("/api/admin/content/:collection", requireAuth, requireCsrf, (req, res) => {
  try {
    const result = createContent(req.params.collection, req.body ?? {});
    return res.status(201).json({ ok: true, slug: result.slug });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.put("/api/admin/content/:collection/:slug", requireAuth, requireCsrf, (req, res) => {
  try {
    const result = updateContent(req.params.collection, req.params.slug, req.body ?? {});
    return res.json({ ok: true, slug: result.slug });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.delete("/api/admin/content/:collection/:slug", requireAuth, requireCsrf, (req, res) => {
  try {
    const result = trashContent(req.params.collection, req.params.slug);
    const items = trashStore.read();
    items.push({
      id: result.id,
      collection: result.collection,
      slug: result.slug,
      title: result.title,
      deletedAt: result.deletedAt,
      status: "active",
      sourcePath: result.sourcePath,
      currentPath: result.currentPath,
    });
    trashStore.write(items);
    return res.json({ ok: true, slug: result.slug, id: result.id });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.get("/api/admin/about", requireAuth, (_req, res) => {
  try {
    return res.json({ ok: true, about: getAboutConfig() });
  } catch (error) {
    return jsonError(res, 500, error.message);
  }
});

app.put("/api/admin/about", requireAuth, requireCsrf, (req, res) => {
  try {
    const about = updateAboutConfig(req.body ?? {});
    return res.json({ ok: true, about });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.get("/api/admin/homepage", requireAuth, (_req, res) => {
  try {
    return res.json({
      ok: true,
      homepage: getHomepageConfig(),
      sectionTypes: homepageSectionTypes,
    });
  } catch (error) {
    return jsonError(res, 500, error.message);
  }
});

app.get("/api/admin/trash", requireAuth, (req, res) => {
  try {
    const view = req.query.view === "archived" ? "archived" : "active";
    return res.json({ ok: true, items: getTrashEntries(view), view });
  } catch (error) {
    return jsonError(res, 500, error.message);
  }
});

app.post("/api/admin/trash/:id/restore", requireAuth, requireCsrf, (req, res) => {
  try {
    const updated = updateTrashEntry(req.params.id, (item) => {
      restoreTrashedContent(item);
      return null;
    });

    return res.json({ ok: true, item: updated });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.post("/api/admin/trash/:id/archive", requireAuth, requireCsrf, (req, res) => {
  try {
    const updated = updateTrashEntry(req.params.id, (item) => {
      const currentPath = archiveTrashedContent(item);
      return {
        ...item,
        currentPath,
        status: "archived",
      };
    });

    return res.json({ ok: true, item: updated });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.put("/api/admin/homepage", requireAuth, requireCsrf, (req, res) => {
  try {
    const homepage = updateHomepageConfig(req.body ?? {});
    return res.json({ ok: true, homepage });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.post(
  "/api/admin/upload",
  requireAuth,
  requireCsrf,
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return jsonError(res, 400, "No image file uploaded.");
    }

    const ext = inferImageExtension(req.file.mimetype, req.file.originalname);
    if (!ext) {
      return jsonError(res, 400, "Only image uploads are allowed.");
    }

    const collection = collections[req.body.collection];
    if (!collection) {
      return jsonError(res, 400, "Invalid collection.");
    }

    const entryDir = safeImageSegment(req.body.slug);
    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const targetDir = path.join(publicImageRoot, req.body.collection, entryDir);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, fileName), req.file.buffer);

    return res.json({
      ok: true,
      path: `/images/${req.body.collection}/${entryDir}/${fileName}`,
    });
  },
);

app.post("/api/admin/publish", requireAuth, requireCsrf, async (_req, res) => {
  const result = await runPublish();
  return res.status(result.status).json(result);
});

app.post("/api/admin/preview", requireAuth, requireCsrf, async (req, res) => {
  try {
    const html = await marked.parse(String(req.body?.body ?? ""), {
      gfm: true,
      breaks: true,
    });
    return res.json({ ok: true, html });
  } catch (error) {
    return jsonError(res, 400, error.message);
  }
});

app.get("/admin/login", (_req, res) => {
  res.sendFile(path.join(staticDir, "login.html"));
});

app.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(staticDir, "app.html"));
});

app.listen(adminPort, "127.0.0.1", () => {
  console.log(`Ricky admin listening on http://127.0.0.1:${adminPort}`);
});
