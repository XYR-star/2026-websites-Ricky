import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import { remarkCmsTrialMedia } from "./src/lib/cms-trial-media.mjs";
import { rehypeImageLoading } from "./src/lib/rehype-image-loading.mjs";
import { rehypeSafeContent } from "./src/lib/rehype-safe-content.mjs";
import { getContentSource } from "./src/lib/payload-content.mjs";
import { retireLegacyAdmin } from "./scripts/retire-legacy-admin.mjs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  site: "https://www.heyrickishere.com",
  integrations: [sitemap(), {
    name: "ricky-retire-legacy-admin",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        await retireLegacyAdmin({ dir, projectRoot: fileURLToPath(new URL(".", import.meta.url)), contentSource: getContentSource() });
      },
    },
  }],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkCmsTrialMedia],
      remarkRehype: { allowDangerousHtml: false },
      rehypePlugins: [rehypeSafeContent, rehypeImageLoading],
    }),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      wrap: true,
    },
  },
});
