import type { Loader } from "astro/loaders";
import { getPayloadSiteContent } from "./payload-content.mjs";

type PayloadCollection = "blog" | "research" | "travel";
type PublishedArticle = {
  slug: string;
  bodyMarkdown: string;
  _status: "published";
  [field: string]: unknown;
};

/** Keep the existing Astro content API, Markdown renderer, and public URLs. */
export function payloadLoader(collection: PayloadCollection): Loader {
  return {
    name: `ricky-payload-${collection}`,
    async load({ store, parseData, renderMarkdown, generateDigest }) {
      const snapshot = await getPayloadSiteContent();
      const entries = await Promise.all(snapshot.articles[collection].map(async (article: PublishedArticle) => {
        const { slug, bodyMarkdown, _status, ...fields } = article;
        const data = await parseData({ id: slug, data: { ...fields, draft: false } });
        const rendered = await renderMarkdown(bodyMarkdown);
        return {
          id: slug,
          data,
          body: bodyMarkdown,
          rendered,
          digest: generateDigest({ data, bodyMarkdown }),
        };
      }));

      // Replace only after the complete collection has validated and rendered.
      // Clearing removes articles that were withdrawn or deleted in the CMS.
      store.clear();
      for (const entry of entries) store.set(entry);
    },
  };
}
