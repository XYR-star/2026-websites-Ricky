import type { CollectionEntry } from "astro:content";

export type PublicCollection = "blog" | "research" | "travel";

export type ContentListEntry =
  | CollectionEntry<"blog">
  | CollectionEntry<"research">
  | CollectionEntry<"travel">;

export type ArchiveEntry = {
  type: PublicCollection;
  slug: string;
  title: string;
  description: string;
  date: Date;
  href: string;
  body: string;
  tags: string[];
};

export type ArchiveMonthGroup = {
  key: string;
  year: number;
  month: number;
  label: string;
  count: number;
  items: ArchiveEntry[];
};

export function sortByDateDesc<T extends { data: { date: Date } }>(items: T[]) {
  return [...items].sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

export function sortPlainDateDesc<T extends { date: Date }>(items: T[]) {
  return [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatMonthLabel(year: number, month: number) {
  return `${year} 年 ${month.toString().padStart(2, "0")} 月`;
}

export function getVisiblePosts(posts: CollectionEntry<"blog">[]) {
  return sortByDateDesc(posts.filter((post) => !post.data.draft));
}

export function getVisibleTravelPosts(posts: CollectionEntry<"travel">[]) {
  return sortByDateDesc(posts.filter((post) => !post.data.draft));
}

export function getVisibleResearchEntries(items: CollectionEntry<"research">[]) {
  return sortByDateDesc(items);
}

export function stripMarkdown(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, " $1 ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEntry(entry: ContentListEntry): ArchiveEntry {
  if ("tags" in entry.data) {
    return {
      type: "blog",
      slug: entry.slug,
      title: entry.data.title,
      description: entry.data.description,
      date: entry.data.date,
      href: `/blog/${entry.slug}`,
      body: entry.body,
      tags: entry.data.tags,
    };
  }

  if ("summary" in entry.data) {
    return {
      type: "research",
      slug: entry.slug,
      title: entry.data.title,
      description: entry.data.summary,
      date: entry.data.date,
      href: `/research/${entry.slug}`,
      body: entry.body,
      tags: [entry.data.project, entry.data.status].filter(Boolean) as string[],
    };
  }

  return {
    type: "travel",
    slug: entry.slug,
    title: entry.data.title,
    description: entry.data.description,
    date: entry.data.date,
    href: `/travel/${entry.slug}`,
    body: entry.body,
    tags: [],
  };
}

export function getArchiveEntries({
  blog,
  research,
  travel,
}: {
  blog: CollectionEntry<"blog">[];
  research: CollectionEntry<"research">[];
  travel: CollectionEntry<"travel">[];
}) {
  return sortPlainDateDesc([
    ...blog.map(normalizeEntry),
    ...research.map(normalizeEntry),
    ...travel.map(normalizeEntry),
  ]);
}

export function groupArchiveEntriesByMonth(items: ArchiveEntry[]) {
  const groups = new Map<string, ArchiveMonthGroup>();

  for (const item of items) {
    const year = item.date.getFullYear();
    const month = item.date.getMonth() + 1;
    const key = `${year}-${month.toString().padStart(2, "0")}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        year,
        month,
        label: formatMonthLabel(year, month),
        count: 0,
        items: [],
      });
    }

    const group = groups.get(key)!;
    group.items.push(item);
    group.count += 1;
  }

  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function getBlogTags(posts: CollectionEntry<"blog">[]) {
  const tags = new Map<string, CollectionEntry<"blog">[]>();

  for (const post of posts) {
    for (const tag of post.data.tags) {
      const key = tag.trim();
      if (!key) continue;

      if (!tags.has(key)) {
        tags.set(key, []);
      }
      tags.get(key)!.push(post);
    }
  }

  return [...tags.entries()]
    .map(([tag, items]) => ({
      tag,
      slug: encodeURIComponent(tag),
      count: items.length,
      items: sortByDateDesc(items),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag, "zh-CN"));
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function getSearchIndex(items: ArchiveEntry[]) {
  return items.map((item) => ({
    type: item.type,
    slug: item.slug,
    title: item.title,
    description: item.description,
    date: item.date.toISOString(),
    href: item.href,
    tags: item.tags,
    text: `${item.title} ${item.description} ${item.tags.join(" ")} ${stripMarkdown(item.body)}`.trim(),
  }));
}

export function getContentNeighbors<T extends { slug: string; data: { date: Date } }>(
  items: T[],
  slug: string,
) {
  const ordered = sortByDateDesc(items);
  const index = ordered.findIndex((item) => item.slug === slug);

  if (index === -1) {
    return {
      previous: null,
      next: null,
    };
  }

  return {
    previous: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  };
}

function scoreOverlap(a: string[], b: string[]) {
  const set = new Set(a.map((item) => item.toLowerCase()));
  return b.reduce((score, item) => score + (set.has(item.toLowerCase()) ? 1 : 0), 0);
}

function baseTimeScore(current: Date, candidate: Date) {
  const diffDays = Math.abs(current.getTime() - candidate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 4 - Math.min(4, diffDays / 30));
}

export function getRelatedPosts(
  posts: CollectionEntry<"blog">[],
  current: CollectionEntry<"blog">,
  limit = 3,
) {
  return posts
    .filter((post) => post.slug !== current.slug)
    .map((post) => ({
      post,
      score:
        scoreOverlap(current.data.tags, post.data.tags) * 4 +
        baseTimeScore(current.data.date, post.data.date),
    }))
    .sort((a, b) => b.score - a.score || b.post.data.date.getTime() - a.post.data.date.getTime())
    .slice(0, limit)
    .map((item) => item.post);
}

export function getRelatedResearch(
  items: CollectionEntry<"research">[],
  current: CollectionEntry<"research">,
  limit = 3,
) {
  const currentTags = [current.data.project, current.data.status].filter(Boolean) as string[];

  return items
    .filter((item) => item.slug !== current.slug)
    .map((item) => ({
      item,
      score:
        scoreOverlap(currentTags, [item.data.project, item.data.status].filter(Boolean) as string[]) * 4 +
        baseTimeScore(current.data.date, item.data.date),
    }))
    .sort((a, b) => b.score - a.score || b.item.data.date.getTime() - a.item.data.date.getTime())
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function getRelatedTravel(
  posts: CollectionEntry<"travel">[],
  current: CollectionEntry<"travel">,
  limit = 3,
) {
  const currentWords = tokenizeText(`${current.data.title} ${current.data.description} ${current.body}`);

  return posts
    .filter((post) => post.slug !== current.slug)
    .map((post) => ({
      post,
      score:
        scoreOverlap(currentWords, tokenizeText(`${post.data.title} ${post.data.description} ${post.body}`)) * 2 +
        baseTimeScore(current.data.date, post.data.date),
    }))
    .sort((a, b) => b.score - a.score || b.post.data.date.getTime() - a.post.data.date.getTime())
    .slice(0, limit)
    .map((entry) => entry.post);
}

function tokenizeText(value: string) {
  return stripMarkdown(value)
    .toLowerCase()
    .split(/[\s/,.!?;:()[\]{}"'`]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}
