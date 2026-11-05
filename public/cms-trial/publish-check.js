const REPO = "XYR-star/2026-websites-Ricky";
const BRANCH = "decap-preview";
const API = "https://api.github.com/repos/" + REPO;

async function github(path) {
  const response = await fetch(API + path, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("暂时无法核对 GitHub 草稿，请稍后再发布。");
  return response.json();
}

export async function checkTravelPublication({ entry }) {
  const collection = entry.get("collection");
  const slug = entry.get("slug");
  if (collection !== "travel" || typeof slug !== "string" ||
      !slug || /[\\/\x00-\x1f]/.test(slug)) {
    throw new Error("无法核对这篇游记的草稿路径。");
  }
  const headRef = "cms/" + collection + "/" + slug;
  const query = new URLSearchParams({ state: "open", base: BRANCH, head: "XYR-star:" + headRef });
  const matches = await github("/pulls?" + query);
  const pull = Array.isArray(matches) && matches.find((candidate) =>
    candidate.base?.ref === BRANCH && candidate.head?.ref === headRef &&
    candidate.head.repo?.full_name?.toLowerCase() === REPO.toLowerCase(),
  );
  if (!pull || ![pull.base?.sha, pull.head?.sha].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) {
    throw new Error("还没有可核对的草稿 PR，请先保存草稿再发布。");
  }
  const comparison = await github("/compare/" + pull.base.sha + "..." + pull.head.sha + "?per_page=1");
  const files = comparison.files;
  const article = `src/content/${collection}/${slug}.md`;
  if (!Array.isArray(files) || files.length >= 300 || !files.some((file) => file.filename === article) ||
      files.some(({ filename, status }) => !["added", "modified"].includes(status) ||
        (filename !== article && !/^public\/images\/cms-trial\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(filename)))) {
    throw new Error("此草稿还包含站点配置或其他文件。请先在 GitHub 核对 PR，再发布。");
  }
}
