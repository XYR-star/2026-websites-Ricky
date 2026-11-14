import { createHash } from "node:crypto";
import { marked } from "marked";
import { isSafeLink, validatePageData } from "./page-data.mjs";

export const payloadCollections = ["blog", "research", "travel"];
export const payloadPageNames = ["homepage", "about", "now", "projects", "tracks", "site"];

const maxResponseBytes = 12 * 1024 * 1024;
const maxArticleBytes = 1024 * 1024;
const snapshotCacheKey = Symbol.for("ricky.payload-published-content.v1");
const articleFields = {
  blog: ["description", "tags", "cover"],
  research: ["summary", "project", "status", "links"],
  travel: ["description", "cover"],
};

function environment() {
  const astroEnv = import.meta.env ?? {};
  return {
    CONTENT_SOURCE: astroEnv.CONTENT_SOURCE ?? process.env.CONTENT_SOURCE,
    CMS_URL: astroEnv.CMS_URL ?? process.env.CMS_URL,
    CMS_READ_TOKEN: astroEnv.CMS_READ_TOKEN ?? process.env.CMS_READ_TOKEN,
  };
}

export function getContentSource(env = environment()) {
  const source = env.CONTENT_SOURCE || "legacy";
  if (source !== "legacy" && source !== "payload") {
    throw new Error("CONTENT_SOURCE must be legacy or payload.");
  }
  return source;
}

function contractError(message) {
  return new Error(`CMS published content is invalid: ${message}`);
}

function record(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(`${description} must be an object.`);
  }
  return value;
}

function exactKeys(value, keys, description) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw contractError(`${description} contains unsupported fields.`);
  }
}

function text(value, description, { optional = false, nonempty = false } = {}) {
  if (value === undefined && optional) return;
  if (typeof value !== "string" || (nonempty && !value.trim())) {
    throw contractError(`${description} must be text.`);
  }
}

function containsPrivateAccess(url) {
  const privateParameters = /^(?:x-amz-.+|x-goog-.+|token|access_token|signature|sig|authorization|credential|key-pair-id|policy)$/i;
  return [...url.searchParams.keys()].some((name) => privateParameters.test(name)) ||
    url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    url.pathname.startsWith("/api/media/");
}

function publishedImageUrl(value, description, required = false) {
  if (value === undefined && !required) return;
  text(value, description, { nonempty: true });
  const reference = value.startsWith("images/") ? `/${value}` : value;
  const localImage = reference.startsWith("/images/");
  if (!isSafeLink(reference) || (!localImage && !/^https?:\/\//i.test(reference))) {
    throw contractError(`${description} must be a public image URL or a local /images/ path.`);
  }
  const url = new URL(reference, "https://static.invalid");
  if (localImage && (!url.pathname.startsWith("/images/") ||
      decodeURIComponent(reference).split("/").some((segment) => segment === ".."))) {
    throw contractError(`${description} contains an unsafe image path.`);
  }
  // A short-lived private URL must never be baked into a public static page.
  if (containsPrivateAccess(url)) {
    throw contractError(`${description} must not contain private access credentials.`);
  }
}

function validateMarkdownMedia(markdown, collection) {
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === "image") {
      publishedImageUrl(token.href, `${collection} body image`, true);
    } else if (token.type === "link" && /^https?:\/\//i.test(token.href)) {
      let url;
      try { url = new URL(token.href); } catch { return; }
      if (containsPrivateAccess(url)) {
        throw contractError(`${collection} body link must not contain private access credentials.`);
      }
    }
  });
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value)) return false;
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === datePart;
}

function validateArticle(value, collection) {
  const article = record(value, `${collection} article`);
  exactKeys(article, [
    "_status", "slug", "title", "date", "bodyMarkdown", "media_id", "draft",
    ...articleFields[collection],
  ], `${collection} article`);

  if (article._status !== "published" || (article.draft !== undefined && article.draft !== false)) {
    throw contractError(`${collection} contains content that is not published.`);
  }
  if (typeof article.slug !== "string" ||
      !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,199}$/u.test(article.slug)) {
    throw contractError(`${collection} contains an unsafe or missing slug.`);
  }
  text(article.title, `${collection} title`, { nonempty: true });
  if (!validDate(article.date)) throw contractError(`${collection} contains an invalid date.`);
  text(article.bodyMarkdown, `${collection} bodyMarkdown`);
  if (Buffer.byteLength(article.bodyMarkdown, "utf8") > maxArticleBytes) {
    throw contractError(`${collection} contains an article larger than the supported limit.`);
  }
  validateMarkdownMedia(article.bodyMarkdown, collection);
  if (article.media_id !== undefined &&
      (typeof article.media_id !== "string" ||
       !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(article.media_id))) {
    throw contractError(`${collection} contains an invalid media identifier.`);
  }

  if (collection === "research") {
    text(article.summary, "research summary");
    text(article.project, "research project", { optional: true });
    text(article.status, "research progress status", { optional: true });
    if (article.links !== undefined) {
      if (!Array.isArray(article.links) || article.links.length > 100) {
        throw contractError("research links must be a supported list.");
      }
      for (const link of article.links) {
        record(link, "research link");
        exactKeys(link, ["label", "href"], "research link");
        text(link.label, "research link label");
        if (!isSafeLink(link.href, { externalOnly: true }) || !/^https?:\/\//i.test(link.href)) {
          throw contractError("research links must use safe HTTP(S) URLs.");
        }
      }
    }
  } else {
    text(article.description, `${collection} description`);
    publishedImageUrl(article.cover, `${collection} cover`, collection === "travel");
  }

  if (collection === "blog" && article.tags !== undefined &&
      (!Array.isArray(article.tags) || article.tags.length > 100 ||
       article.tags.some((tag) => typeof tag !== "string"))) {
    throw contractError("blog tags must be a supported text list.");
  }
  return article;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Validate the whole response before any collection is allowed to use it. */
export function validatePayloadSiteContent(value) {
  const snapshot = record(value, "response");
  exactKeys(snapshot, ["schemaVersion", "articles", "pages", "generatedAt", "revision"], "response");
  if (snapshot.schemaVersion !== 1) throw contractError("unsupported schemaVersion.");
  const articles = record(snapshot.articles, "articles");
  const pages = record(snapshot.pages, "pages");
  exactKeys(articles, payloadCollections, "articles");
  exactKeys(pages, payloadPageNames, "pages");

  for (const collection of payloadCollections) {
    if (!Array.isArray(articles[collection])) {
      throw contractError(`the ${collection} collection is missing.`);
    }
    const slugs = new Set();
    for (const value of articles[collection]) {
      const article = validateArticle(value, collection);
      if (slugs.has(article.slug)) throw contractError(`${collection} contains duplicate slugs.`);
      slugs.add(article.slug);
    }
  }

  for (const page of payloadPageNames) {
    try {
      validatePageData(page, pages[page]);
    } catch {
      // Do not print a server response, private text, or credentials in build logs.
      throw contractError(`the ${page} page is missing or failed validation.`);
    }
  }
  return deepFreeze({ schemaVersion: 1, articles, pages });
}

export function getPayloadRequestSettings(env = environment()) {
  if (typeof env.CMS_URL !== "string" || !env.CMS_URL.trim()) {
    throw new Error("Payload content requires CMS_URL.");
  }
  let url;
  try {
    url = new URL(env.CMS_URL);
  } catch {
    throw new Error("CMS_URL must be an absolute HTTPS URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("CMS_URL must use HTTPS without credentials, query parameters, or fragments.");
  }
  const token = env.CMS_READ_TOKEN;
  if (typeof token !== "string" || !/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) {
    throw new Error("Payload content requires a valid, dedicated CMS_READ_TOKEN.");
  }
  const endpoint = `${url.href.replace(/\/+$/, "")}/api/site-content`;
  return { endpoint, token };
}

async function responseJson(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("CMS published content exceeds the response size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("CMS returned an empty content response.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new Error("CMS published content exceeds the response size limit.");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof Error && error.message === "CMS published content exceeds the response size limit.") {
      throw error;
    }
    throw new Error("CMS did not return a readable JSON content response.");
  } finally {
    reader.releaseLock();
  }
}

async function fetchPublishedContent(settings, { fetchImpl, timeoutMs, maximumBytes }) {
  let response;
  try {
    response = await fetchImpl(settings.endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${settings.token}`,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("Unable to read published CMS content. The build was stopped; local content was not substituted.");
  }
  if (!response.ok) {
    throw new Error(`CMS published content request failed (HTTP ${response.status}). The build was stopped.`);
  }
  if (!/^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error("CMS did not return a JSON content response. The build was stopped.");
  }
  return validatePayloadSiteContent(await responseJson(response, maximumBytes));
}

/** A reader belongs to one build and deliberately retains failures as well as success. */
export function createPayloadContentReader({
  env = environment(),
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  maximumBytes = maxResponseBytes,
} = {}) {
  let result;
  return () => {
    result ??= fetchPublishedContent(getPayloadRequestSettings(env), { fetchImpl, timeoutMs, maximumBytes });
    return result;
  };
}

/** Share one published response across Astro's content sync and page-rendering modules. */
export function getPayloadSiteContent() {
  const settings = getPayloadRequestSettings();
  const cacheId = `${settings.endpoint}:${createHash("sha256").update(settings.token).digest("hex")}`;
  const cache = globalThis[snapshotCacheKey] ??= new Map();
  if (!cache.has(cacheId)) {
    cache.set(cacheId, fetchPublishedContent(settings, {
      fetchImpl: globalThis.fetch,
      timeoutMs: 20_000,
      maximumBytes: maxResponseBytes,
    }));
  }
  return cache.get(cacheId);
}

export async function getPageData(name, legacyData) {
  if (!payloadPageNames.includes(name)) throw new Error("Unsupported site page configuration.");
  if (getContentSource() === "legacy") return validatePageData(name, legacyData);
  const snapshot = await getPayloadSiteContent();
  return snapshot.pages[name];
}
