import fs from "node:fs";
import { aboutConfigPath } from "./config.mjs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readConfig() {
  return JSON.parse(fs.readFileSync(aboutConfigPath, "utf8"));
}

function normalizeLink(link, index) {
  if (!isNonEmptyString(link?.label) && !isNonEmptyString(link?.href)) {
    return null;
  }

  if (!isNonEmptyString(link?.label) || !isNonEmptyString(link?.href)) {
    throw new Error(`About link #${index + 1} must include label and href.`);
  }

  return {
    label: link.label.trim(),
    href: link.href.trim(),
  };
}

export function getAboutConfig() {
  return readConfig();
}

export function updateAboutConfig(payload) {
  if (!payload?.facts || typeof payload.facts !== "object") {
    throw new Error("About facts are required.");
  }

  const normalized = {
    hero: {
      eyebrow: String(payload.hero.eyebrow ?? "").trim(),
      title: String(payload.hero.title ?? "").trim(),
      intro: String(payload.hero.intro ?? "").trim(),
    },
    profileCard: {
      sectionLabel: String(payload.profileCard.sectionLabel ?? "").trim(),
      title: String(payload.profileCard.title ?? "").trim(),
      body: String(payload.profileCard.body ?? "").trim(),
      secondaryBody: String(payload.profileCard.secondaryBody ?? "").trim(),
    },
    facts: {
      sectionLabel: String(payload.facts.sectionLabel ?? "").trim(),
      locationLabel: String(payload.facts.locationLabel ?? "").trim(),
      location: String(payload.facts.location ?? "").trim(),
      emailLabel: String(payload.facts.emailLabel ?? "").trim(),
      email: String(payload.facts.email ?? "").trim(),
      topicsLabel: String(payload.facts.topicsLabel ?? "").trim(),
      topics: String(payload.facts.topics ?? "").trim(),
    },
    links: Array.isArray(payload.links) ? payload.links.map(normalizeLink).filter(Boolean) : [],
  };

  fs.writeFileSync(aboutConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}
