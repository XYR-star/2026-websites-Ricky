import fs from "node:fs";
import { homepageConfigPath, homepageSectionTypes } from "./config.mjs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLink(value) {
  return isNonEmptyString(value) ? value.trim() : "";
}

function normalizeCuratedItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, 6).map((item) => ({
    ...(isNonEmptyString(item?.eyebrow) ? { eyebrow: item.eyebrow.trim() } : {}),
    title: String(item?.title ?? "").trim(),
    description: String(item?.description ?? "").trim(),
    href: normalizeLink(item?.href),
  }));
}

function validateHero(hero) {
  if (!hero || typeof hero !== "object") {
    throw new Error("Homepage hero is required.");
  }

  if (!isNonEmptyString(hero.id)) {
    throw new Error("Homepage hero must include id.");
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

  if (section.type === "curatedLinks") {
    if (!Array.isArray(section.items) || section.items.length > 6) {
      throw new Error(`Homepage section "${section.id}" can include up to 6 curated links.`);
    }
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

  if (section.type === "curatedLinks") {
    normalized.body = isNonEmptyString(section.body) ? section.body.trim() : "";
    normalized.items = normalizeCuratedItems(section.items);
  }

  if (section.type === "quote") {
    normalized.quote = String(section.quote ?? "").trim();
  }

  if (["aboutNote", "richText", "nowSummary"].includes(section.type)) {
    normalized.body = String(section.body ?? "").trim();
  }

  return normalized;
}

export function getHomepageConfig() {
  const raw = fs.readFileSync(homepageConfigPath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    hero: {
      id: String(parsed?.hero?.id ?? "").trim(),
      eyebrow: String(parsed?.hero?.eyebrow ?? "").trim(),
      title: String(parsed?.hero?.title ?? "").trim(),
      intro: String(parsed?.hero?.intro ?? "").trim(),
      ...(isNonEmptyString(parsed?.hero?.note) ? { note: parsed.hero.note.trim() } : {}),
      ...(isNonEmptyString(parsed?.hero?.primaryLinkLabel)
        ? { primaryLinkLabel: parsed.hero.primaryLinkLabel.trim() }
        : {}),
      ...(isNonEmptyString(parsed?.hero?.primaryLinkHref)
        ? { primaryLinkHref: normalizeLink(parsed.hero.primaryLinkHref) }
        : {}),
      ...(isNonEmptyString(parsed?.hero?.secondaryLinkLabel)
        ? { secondaryLinkLabel: parsed.hero.secondaryLinkLabel.trim() }
        : {}),
      ...(isNonEmptyString(parsed?.hero?.secondaryLinkHref)
        ? { secondaryLinkHref: normalizeLink(parsed.hero.secondaryLinkHref) }
        : {}),
    },
    sections: Array.isArray(parsed?.sections) ? parsed.sections.map(normalizeSection) : [],
  };
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
      title: String(payload.hero.title ?? "").trim(),
      intro: String(payload.hero.intro ?? "").trim(),
      ...(isNonEmptyString(payload.hero.note) ? { note: payload.hero.note.trim() } : {}),
      ...(isNonEmptyString(payload.hero.primaryLinkLabel)
        ? { primaryLinkLabel: payload.hero.primaryLinkLabel.trim() }
        : {}),
      ...(isNonEmptyString(payload.hero.primaryLinkHref)
        ? { primaryLinkHref: normalizeLink(payload.hero.primaryLinkHref) }
        : {}),
      ...(isNonEmptyString(payload.hero.secondaryLinkLabel)
        ? { secondaryLinkLabel: payload.hero.secondaryLinkLabel.trim() }
        : {}),
      ...(isNonEmptyString(payload.hero.secondaryLinkHref)
        ? { secondaryLinkHref: normalizeLink(payload.hero.secondaryLinkHref) }
        : {}),
    },
    sections: payload.sections.map(normalizeSection),
  };

  fs.writeFileSync(homepageConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}
