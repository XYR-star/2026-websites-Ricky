import { isSafeLink } from "./page-data.mjs";

function safeMarkdownUrl(value, isImage = false) {
  if (typeof value !== "string" || !value) return false;
  // Validate relative Markdown paths as local paths without rewriting them.
  const reference = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value) ? value : "/" + value;
  return isSafeLink(reference) && (!isImage || !/^mailto:/i.test(value));
}

export function rehypeSafeContent() {
  return function visit(node) {
    const children = node.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.type !== "element") continue;

      const properties = child.properties ?? {};
      if (child.tagName === "img" && !safeMarkdownUrl(properties.src, true)) {
        children[index] = { type: "text", value: typeof properties.alt === "string" ? properties.alt : "" };
        continue;
      }
      if (child.tagName === "a" && !safeMarkdownUrl(properties.href)) {
        delete properties.href;
        child.tagName = "span";
      }
      visit(child);
    }
  };
}
