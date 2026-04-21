import fs from "node:fs";
import { homepageConfigPath, homepageSectionTypes } from "./config.mjs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLink(value) {
  return isNonEmptyString(value) ? value.trim() : "";
}

function validateHero(hero) {
  if (!hero || typeof hero !== "object") {
    throw new Error("Homepage hero is required.");
  }

  if (!isNonEmptyString(hero.id) || !isNonEmptyString(hero.title) || !isNonEmptyString(hero.intro)) {
    throw new Error("Homepage hero must include id, title, and intro.");
  }
}

function validateSection(section, index) {
  if (!section || typeof section !== "object") {
    throw new Error(`Homepage section #${index + 1} is invalid.`);
  }

  if (!isNonEmptyString(section.id)) {
    throw new Error(`Homepage section #${index + 1} must include id.`);
  }

  if (!homepageSectionTypes.includes(section.type)) {
    throw new Error(`Homepage section "${section.id}" has unsupported type.`);
  }

  if (typeof section.enabled !== "boolean") {
    throw new Error(`Homepage section "${section.id}" must define enabled.`);
  }

  if (!Number.isFinite(Number(section.order))) {
    throw new Error(`Homepage section "${section.id}" must define a numeric order.`);
  }

  if (["featuredPosts", "travelList", "researchList"].includes(section.type)) {
    const count = Number(section.count ?? 3);
    if (!Number.isFinite(count) || count < 1 || count > 12) {
      throw new Error(`Homepage section "${section.id}" count must be between 1 and 12.`);
    }
  }

  if (section.type === "quote" && !isNonEmptyString(section.quote)) {
    throw new Error(`Homepage section "${section.id}" must include quote text.`);
  }

  if (["aboutNote", "richText"].includes(section.type) && !isNonEmptyString(section.body)) {
    throw new Error(`Homepage section "${section.id}" must include body text.`);
  }
}

function normalizeSection(section) {
  const normalized = {
    id: String(section.id).trim(),
    type: section.type,
    enabled: Boolean(section.enabled),
    order: Number(section.order),
    ...(isNonEmptyString(section.eyebrow) ? { eyebrow: section.eyebrow.trim() } : {}),
    ...(isNonEmptyString(section.title) ? { title: section.title.trim() } : {}),
    ...(isNonEmptyString(section.linkLabel) ? { linkLabel: section.linkLabel.trim() } : {}),
    ...(isNonEmptyString(section.linkHref) ? { linkHref: normalizeLink(section.linkHref) } : {}),
  };

  if (["featuredPosts", "travelList", "researchList"].includes(section.type)) {
    normalized.count = Number(section.count ?? 3);
  }

  if (section.type === "quote") {
    normalized.quote = section.quote.trim();
  }

  if (["aboutNote", "richText"].includes(section.type)) {
    normalized.body = section.body.trim();
  }

  return normalized;
}

export function getHomepageConfig() {
  const raw = fs.readFileSync(homepageConfigPath, "utf8");
  return JSON.parse(raw);
}

export function updateHomepageConfig(payload) {
  validateHero(payload?.hero);

  if (!Array.isArray(payload?.sections)) {
    throw new Error("Homepage sections must be an array.");
  }

  const seenIds = new Set([payload.hero.id.trim()]);
  payload.sections.forEach((section, index) => {
    validateSection(section, index);
    const sectionId = String(section.id).trim();
    if (seenIds.has(sectionId)) {
      throw new Error(`Homepage section id "${sectionId}" must be unique.`);
    }
    seenIds.add(sectionId);
  });

  const normalized = {
    hero: {
      id: payload.hero.id.trim(),
      eyebrow: String(payload.hero.eyebrow ?? "").trim(),
      title: payload.hero.title.trim(),
      intro: payload.hero.intro.trim(),
    },
    sections: payload.sections.map(normalizeSection),
  };

  fs.writeFileSync(homepageConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}
