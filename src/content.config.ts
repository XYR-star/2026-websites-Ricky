import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { cmsTrialMediaUrl } from "./lib/cms-trial-media.mjs";
import { getContentSource } from "./lib/payload-content.mjs";
import { payloadLoader } from "./lib/payload-loader";

const markdownFiles = ["**/*.md", "!**/_*/**/*.md", "!**/_*.md"];
const contentSource = getContentSource();
const articleLoader = (collection: "blog" | "research" | "travel") =>
  contentSource === "payload"
    ? payloadLoader(collection)
    : glob({ base: `./src/content/${collection}`, pattern: markdownFiles });

const blog = defineCollection({
  loader: articleLoader("blog"),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
    media_id: z.uuid().optional(),
  }),
});

const research = defineCollection({
  loader: articleLoader("research"),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    draft: z.boolean().default(false),
    media_id: z.uuid().optional(),
    project: z.string().optional(),
    status: z.string().optional(),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.url().refine((value) => /^https?:\/\//i.test(value), {
            message: "研究链接仅支持 http 或 https 地址",
          }),
        }),
      )
      .default([]),
  }),
});

const travel = defineCollection({
  loader: articleLoader("travel"),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    cover: z.string().transform(cmsTrialMediaUrl),
    media_id: z.uuid().optional(),
  }),
});

export const collections = {
  blog,
  research,
  travel,
};
