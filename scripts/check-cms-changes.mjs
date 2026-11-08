import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function validateCMSChanges({ headRef, baseRef, sameRepository, changes }) {
  if (typeof headRef !== "string") throw new Error("Invalid CMS branch reference.");
  if (!headRef.startsWith("cms/")) return;
  const match = /^cms\/(blog|travel|research|pages)\/(.+)$/.exec(headRef);
  if (sameRepository !== true || baseRef !== "main" || !match || !validSlug(match[2])) {
    throw new Error("CMS pull requests must belong to this repository and target an allowed content entry on main.");
  }
  const isPage = match[1] === "pages";
  const contentFile = isPage ? pageFiles.get(match[2]) : `src/content/${match[1]}/${match[2]}.md`;
  if (!contentFile) throw new Error("Unknown CMS page entry.");
  const historicalImage = /^public\/images\/cms-trial\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i;
  if (!Array.isArray(changes) || !changes.some(({ path }) => path === contentFile) || changes.some(({ status, path, mode }) =>
    !["A", "M"].includes(status) || mode !== "100644" ||
    (path !== contentFile && (isPage || !historicalImage.test(path))))) {
    throw new Error("A CMS pull request may only add or update its own content file (plus historical CMS images for articles).");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]) && process.env.GITHUB_EVENT_PATH) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pull = event.pull_request;
  if (pull?.head.ref.startsWith("cms/")) {
    const { sha: baseSha } = pull.base;
    const { sha: headSha } = pull.head;
    if (![baseSha, headSha].every((sha) => /^[a-f0-9]{40}$/.test(sha))) {
      throw new Error("Invalid commit reference.");
    }
    const records = execFileSync("git", ["diff", "--no-renames", "--name-status", "-z", `${baseSha}...${headSha}`],
      { encoding: "utf8" }).split("\0");
    records.pop();
    if (records.length % 2) throw new Error("Invalid changed-file list.");
    const changes = [];
    for (let index = 0; index < records.length; index += 2) {
      const path = records[index + 1];
      const tree = execFileSync("git", ["ls-tree", "-z", headSha, "--", path], { encoding: "utf8" });
      const mode = /^(\d{6}) blob [a-f0-9]{40}\t/.exec(tree)?.[1];
      changes.push({ status: records[index], path, mode });
    }
    validateCMSChanges({
      headRef: pull.head.ref,
      baseRef: pull.base.ref,
      sameRepository: Boolean(pull.head.repo?.full_name) && pull.head.repo.full_name === pull.base.repo?.full_name,
      changes,
    });
    console.log("CMS content changes passed.");
  } else {
    console.log("No CMS publication to check.");
  }
}
