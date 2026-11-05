import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { remarkCmsTrialMedia } from "./src/lib/cms-trial-media.mjs";
import { rehypeImageLoading } from "./src/lib/rehype-image-loading.mjs";

export default defineConfig({
  site: "https://www.heyrickishere.com",
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkCmsTrialMedia],
    rehypePlugins: [rehypeImageLoading],
    shikiConfig: {
      theme: "github-light",
      wrap: true,
    },
  },
});
