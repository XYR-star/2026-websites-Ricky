import { Marked, Renderer } from "marked";
import { isSafeLink } from "../../src/lib/page-data.mjs";

const htmlEntities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function safeReference(href, image = false) {
  const reference = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href) ? href : "/" + href;
  if (!href || !isSafeLink(reference) || (image && /^mailto:/i.test(href))) return null;

  // Marked preserves entities in href and src. Escape ampersands before writing
  // them so a browser cannot turn an encoded colon or control into a scheme.
  return href.replace(/&(?:amp;)?/g, "&amp;");
}

const preview = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    text(token) {
      // Marked normally trusts text inside raw HTML tags such as <pre>.
      if (token.escaped) return escapeHtml(token.text);
      return Renderer.prototype.text.call(this, token);
    },
    link(token) {
      const href = safeReference(token.href);
      if (href === null) return this.parser.parseInline(token.tokens);
      return Renderer.prototype.link.call(this, { ...token, href });
    },
    image(token) {
      const href = safeReference(token.href, true);
      if (href === null) return escapeHtml(this.parser.parseInline(token.tokens, this.parser.textRenderer));
      return Renderer.prototype.image.call(this, { ...token, href });
    },
  },
});

export function renderMarkdownPreview(body) {
  return preview.parse(body);
}
