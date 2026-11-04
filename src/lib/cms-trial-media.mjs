export function cmsTrialMediaUrl(url) {
  return url.startsWith("images/cms-trial/") ? "/" + url : url;
}

export function remarkCmsTrialMedia() {
  return function visit(node) {
    if (node.type === "image" || node.type === "definition") {
      node.url = cmsTrialMediaUrl(node.url);
    }
    for (const child of node.children ?? []) visit(child);
  };
}
