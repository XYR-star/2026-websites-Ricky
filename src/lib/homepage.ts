export const homepageSectionTypes = [
  "featuredPosts",
  "travelList",
  "researchList",
  "curatedLinks",
  "nowSummary",
  "aboutNote",
  "quote",
  "richText",
] as const;

export type HomepageSectionType = (typeof homepageSectionTypes)[number];

export type HomepageHero = {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  note?: string;
  primaryLinkLabel?: string;
  primaryLinkHref?: string;
  secondaryLinkLabel?: string;
  secondaryLinkHref?: string;
};

export type HomepageCuratedLinkItem = {
  eyebrow?: string;
  title: string;
  description: string;
  href: string;
};

export type HomepageSectionBase = {
  id: string;
  type: HomepageSectionType;
  enabled: boolean;
  order: number;
  eyebrow?: string;
  title?: string;
  linkLabel?: string;
  linkHref?: string;
};

export type HomepageListSection = HomepageSectionBase & {
  type: "featuredPosts" | "travelList" | "researchList";
  count?: number;
};

export type HomepageQuoteSection = HomepageSectionBase & {
  type: "quote";
  quote: string;
};

export type HomepageCuratedLinksSection = HomepageSectionBase & {
  type: "curatedLinks";
  body?: string;
  items: HomepageCuratedLinkItem[];
};

export type HomepageNowSummarySection = HomepageSectionBase & {
  type: "nowSummary";
  body: string;
};

export type HomepageAboutNoteSection = HomepageSectionBase & {
  type: "aboutNote";
  body: string;
};

export type HomepageRichTextSection = HomepageSectionBase & {
  type: "richText";
  body: string;
};

export type HomepageSection =
  | HomepageListSection
  | HomepageQuoteSection
  | HomepageCuratedLinksSection
  | HomepageNowSummarySection
  | HomepageAboutNoteSection
  | HomepageRichTextSection;

export type HomepageContent = {
  hero: HomepageHero;
  sections: HomepageSection[];
};

export function getOrderedHomepageSections(sections: HomepageSection[]) {
  return [...sections]
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order);
}

export function getHomepageSectionLabel(section: HomepageSection) {
  return section.title || section.eyebrow || section.id;
}

export function splitHomepageBody(body?: string) {
  if (!body) {
    return [];
  }

  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
