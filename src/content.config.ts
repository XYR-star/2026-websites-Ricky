import { defineCollection, z } from "astro:content";
import { cmsTrialMediaUrl } from "./lib/cms-trial-media.mjs";

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
  }),
});

const research = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    project: z.string().optional(),
    status: z.string().optional(),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.string().url(),
        }),
      )
      .default([]),
  }),
});

const travel = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    cover: z.string().transform(cmsTrialMediaUrl),
    media_id: z.string().uuid().optional(),
  }),
});

export const collections = {
  blog,
  research,
  travel,
};
