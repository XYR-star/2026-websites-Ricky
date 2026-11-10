import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import { remarkCmsTrialMedia } from "./src/lib/cms-trial-media.mjs";
import { rehypeImageLoading } from "./src/lib/rehype-image-loading.mjs";
import { rehypeSafeContent } from "./src/lib/rehype-safe-content.mjs";

export default defineConfig({
  site: "https://www.heyrickishere.com",
  integrations: [sitemap()],
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
