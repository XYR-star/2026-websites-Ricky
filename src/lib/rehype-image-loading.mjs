export function rehypeImageLoading() {
  return function visit(node) {
    if (node.type === "element" && node.tagName === "img") {
      node.properties ??= {};
      node.properties.loading ??= "lazy";
      node.properties.decoding ??= "async";
    }
    for (const child of node.children ?? []) visit(child);
  };
}
