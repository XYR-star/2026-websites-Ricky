import type { CollectionEntry } from "astro:content";

export function sortByDateDesc<T extends { data: { date: Date } }>(items: T[]) {
  return [...items].sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
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
