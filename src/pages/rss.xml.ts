import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { siteMeta } from "../data/site";
import { getVisiblePosts } from "../lib/content";

export async function GET(context: { site: URL | undefined }) {
  const posts = getVisiblePosts(await getCollection("blog"));

  return rss({
    title: `${siteMeta.title} RSS`,
    description: siteMeta.description,
    site: context.site ?? siteMeta.siteUrl,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.slug}/`,
    })),
  });
}
