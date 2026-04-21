import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { collections, trashArchiveRoot, trashRoot } from "./config.mjs";

function slugify(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || "untitled";
}

function formatDateInput(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && value.includes("T")) {
    return value.slice(0, 10);
  }

  return value;
}

function serializeFrontmatter(collectionName, payload) {
  if (collectionName === "blog") {
    return {
      title: payload.title,
      description: payload.description,
      date: formatDateInput(payload.date),
      tags: payload.tags ?? [],
      draft: Boolean(payload.draft),
      ...(payload.cover ? { cover: payload.cover } : {}),
    };
  }

  if (collectionName === "research") {
    return {
      title: payload.title,
      date: formatDateInput(payload.date),
      summary: payload.summary,
      ...(payload.project ? { project: payload.project } : {}),
      ...(payload.status ? { status: payload.status } : {}),
      links: payload.links ?? [],
    };
  }

  return {
    title: payload.title,
    description: payload.description,
    date: formatDateInput(payload.date),
    draft: Boolean(payload.draft),
    cover: payload.cover,
  };
}

function ensureCollection(collectionName) {
  if (!collections[collectionName]) {
    throw new Error(`Unsupported collection: ${collectionName}`);
  }

  return collections[collectionName];
}

function validatePayload(collectionName, payload) {
  if (!payload.title?.trim()) {
    throw new Error("Title is required.");
  }

  if (collectionName === "blog") {
    if (!payload.description?.trim()) {
      throw new Error("Description is required.");
    }
    return;
  }

  if (collectionName === "research") {
    if (!payload.summary?.trim()) {
      throw new Error("Summary is required.");
    }

    for (const link of payload.links ?? []) {
      if (!link.label || !link.href) {
        throw new Error("Research links must include label and href.");
      }
    }
    return;
  }

  if (!payload.description?.trim()) {
    throw new Error("Description is required.");
  }

  if (!payload.cover?.trim()) {
    throw new Error("Cover is required for travel posts.");
  }
}

function parseEntry(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  return {
    slug: path.basename(filePath, ".md"),
    filePath,
    data: parsed.data,
    body: parsed.content.trim(),
  };
}

export function listContent(collectionName) {
  const collection = ensureCollection(collectionName);
  const files = fs
    .readdirSync(collection.dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .reverse();

  return files.map((file) => {
    const item = parseEntry(path.join(collection.dir, file));
    return {
      slug: item.slug,
      title: item.data.title,
      date: formatDateInput(item.data.date),
      draft: Boolean(item.data.draft),
      description: item.data.description ?? item.data.summary ?? "",
      cover: item.data.cover ?? "",
    };
  });
}

export function getContent(collectionName, slug) {
  const collection = ensureCollection(collectionName);
  const filePath = path.join(collection.dir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const item = parseEntry(filePath);
  return {
    slug,
    filePath,
    ...item.data,
    date: formatDateInput(item.data.date),
    body: item.body,
  };
}

export function createContent(collectionName, payload) {
  const collection = ensureCollection(collectionName);
  validatePayload(collectionName, payload);

  const datePart = formatDateInput(payload.date);
  const baseSlug = slugify(payload.slug || payload.title);
  const entrySlug = `${datePart}-${baseSlug}`;
  const filePath = path.join(collection.dir, `${entrySlug}.md`);

  if (fs.existsSync(filePath)) {
    throw new Error("A content entry with that date and slug already exists.");
  }

  const frontmatter = serializeFrontmatter(collectionName, payload);
  const body = payload.body?.trim() ?? "";
  const output = matter.stringify(body.length > 0 ? `${body}\n` : "", frontmatter);
  fs.writeFileSync(filePath, output);

  return { slug: entrySlug, filePath };
}

export function updateContent(collectionName, slug, payload) {
  const collection = ensureCollection(collectionName);
  validatePayload(collectionName, payload);

  const filePath = path.join(collection.dir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error("Content entry not found.");
  }

  const frontmatter = serializeFrontmatter(collectionName, payload);
  const body = payload.body?.trim() ?? "";
  const output = matter.stringify(body.length > 0 ? `${body}\n` : "", frontmatter);
  fs.writeFileSync(filePath, output);

  return { slug, filePath };
}

export function trashContent(collectionName, slug) {
  const collection = ensureCollection(collectionName);
  const filePath = path.join(collection.dir, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error("Content entry not found.");
  }

  const item = parseEntry(filePath);
  const targetDir = path.join(trashRoot, collectionName);
  fs.mkdirSync(targetDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetPath = path.join(targetDir, `${timestamp}-${slug}.md`);
  fs.renameSync(filePath, targetPath);

  return {
    id: `${collectionName}:${slug}:${timestamp}`,
    title: item.data.title ?? slug,
    collection: collectionName,
    slug,
    sourcePath: filePath,
    currentPath: targetPath,
    deletedAt: new Date().toISOString(),
    targetPath,
  };
}

export function restoreTrashedContent(item) {
  const collection = ensureCollection(item.collection);
  const restoredPath = path.join(collection.dir, `${item.slug}.md`);

  if (!fs.existsSync(item.currentPath)) {
    throw new Error("Archived content file not found.");
  }

  if (fs.existsSync(restoredPath)) {
    throw new Error("A content file with the same slug already exists.");
  }

  fs.renameSync(item.currentPath, restoredPath);
  return restoredPath;
}

export function archiveTrashedContent(item) {
  if (!fs.existsSync(item.currentPath)) {
    throw new Error("Trash content file not found.");
  }

  const archiveDir = path.join(trashArchiveRoot, item.collection);
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivedPath = path.join(archiveDir, path.basename(item.currentPath));
  fs.renameSync(item.currentPath, archivedPath);
  return archivedPath;
}
