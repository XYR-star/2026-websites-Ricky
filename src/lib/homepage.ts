export const homepageSectionTypes = [
  "featuredPosts",
  "travelList",
  "researchList",
  "curatedLinks",
  "nowSummary",
  "aboutNote",
  "quote",
  "richText",
  "magazineCover",
  "magazineContents",
  "homeIntro",
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
  order?: number;
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

export type HomepageMagazineCover = HomepageSectionBase & {
  type: "magazineCover";
  travelSlug?: string | null;
};

export type HomepageMagazineContents = HomepageSectionBase & {
  type: "magazineContents";
  count?: number;
};

export type HomepageIntro = HomepageSectionBase & {
  type: "homeIntro";
};

export type HomepageSection =
  | HomepageListSection
  | HomepageQuoteSection
  | HomepageCuratedLinksSection
  | HomepageNowSummarySection
  | HomepageAboutNoteSection
  | HomepageRichTextSection
  | HomepageMagazineCover
  | HomepageMagazineContents
  | HomepageIntro;

export type HomepageContent = {
  layoutVersion?: 1;
  hero: HomepageHero;
  sections: HomepageSection[];
};

export function getOrderedHomepageSections(sections: HomepageSection[]) {
  // The CMS list order is the display order, including after dragging sections.
  return sections.filter((section) => section.enabled);
}

const magazineSectionLabels: Partial<Record<HomepageSectionType, string>> = {
  magazineCover: "封面故事",
  magazineContents: "继续阅读",
  homeIntro: "开场",
};

export function usesMagazineLayout(homepage: HomepageContent) {
  return homepage.layoutVersion === 1 ||
    homepage.sections.some((section) => Object.hasOwn(magazineSectionLabels, section.type));
}

export function getHomepageLayout(homepage: HomepageContent): HomepageSection[] {
  const sections = getOrderedHomepageSections(homepage.sections);
  if (usesMagazineLayout(homepage)) return sections;

  const ids = new Set([homepage.hero.id, ...homepage.sections.map((section) => section.id)]);
  const legacyId = (name: string) => {
    let id = name;
    while (ids.has(id)) id += "-legacy";
    return id;
  };
  // Older homepage data had these three sections built into the page template.
  return [
    { id: legacyId("magazine-cover"), type: "magazineCover", enabled: true },
    {
      id: legacyId("magazine-contents"), type: "magazineContents", enabled: true,
      linkLabel: "全部归档", linkHref: "/archive",
    },
    { id: homepage.hero.id, type: "homeIntro", enabled: true },
    ...sections,
  ];
}

export function getHomepageSectionLabel(section: HomepageSection) {
  return section.title || section.eyebrow || magazineSectionLabels[section.type] || section.id;
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
