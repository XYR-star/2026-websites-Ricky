export const homepageSectionTypes = [
  "featuredPosts",
  "travelList",
  "researchList",
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
