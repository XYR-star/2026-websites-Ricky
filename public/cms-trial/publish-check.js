const REPO = "XYR-star/2026-websites-Ricky";
const API = "https://api.github.com/repos/" + REPO;
const articleCollections = new Set(["blog", "travel", "research"]);
const pageFiles = new Map([
  ["homepage", "src/data/homepage.json"],
  ["about", "src/data/about.json"],
  ["now", "src/data/now.json"],
  ["projects", "src/data/projects.json"],
  ["site", "src/data/site.json"],
]);

function validSlug(slug) {
  return typeof slug === "string" && slug.length > 0 &&
    !slug.startsWith(".") && !slug.endsWith(".") && !/\.lock$/i.test(slug) &&
    !slug.includes("..") && !slug.includes("@{") &&
    !/[\\/\x00-\x20\x7f~^:?*\[\]]/.test(slug);
}

async function github(path) {
  const response = await fetch(API + path, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("暂时无法核对 GitHub 草稿，请稍后再发布。");
  return response.json();
}

export async function checkArticlePublication({ entry }, branch = "main") {
  if (!["main", "decap-preview"].includes(branch)) {
    throw new Error("后台发布目标无效，请重新打开编辑器。");
  }
  const collection = entry.get("collection");
  const slug = entry.get("slug");
  const isPage = collection === "pages";
  const contentFile = isPage ? pageFiles.get(slug) : articleCollections.has(collection) ? `src/content/${collection}/${slug}.md` : null;
  if (!contentFile || !validSlug(slug)) {
    throw new Error("无法核对这项内容的草稿路径。");
  }
  const headRef = "cms/" + collection + "/" + slug;
  const query = new URLSearchParams({ state: "open", base: branch, head: "XYR-star:" + headRef });
  const matches = await github("/pulls?" + query);
  const pull = Array.isArray(matches) && matches.find((candidate) =>
    candidate.state === "open" && candidate.base?.ref === branch && candidate.head?.ref === headRef &&
    candidate.base.repo?.full_name?.toLowerCase() === REPO.toLowerCase() &&
    candidate.head.repo?.full_name?.toLowerCase() === REPO.toLowerCase(),
  );
  if (!pull || ![pull.base?.sha, pull.head?.sha].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) {
    throw new Error("还没有可核对的草稿 PR，请先保存草稿再发布。");
  }
  const comparison = await github("/compare/" + pull.base.sha + "..." + pull.head.sha + "?per_page=1");
  const files = comparison.files;
  if (!Array.isArray(files) || files.length >= 300 || !files.some((file) => file.filename === contentFile) ||
      files.some(({ filename, status }) => !["added", "modified"].includes(status) ||
        (filename !== contentFile && (isPage || !/^public\/images\/cms-trial\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(filename))))) {
    throw new Error("此草稿包含当前编辑范围之外的其他文件。请先在 GitHub 核对 PR，再发布。");
  }
}

// Keep older, cached trial loaders working while the shared loader adopts the generic name.
export const checkTravelPublication = checkArticlePublication;
