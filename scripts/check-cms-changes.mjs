import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function validateCMSChanges({ headRef, baseRef, sameRepository, changes }) {
  if (!headRef.startsWith("cms/")) return;
  const match = /^cms\/travel\/([^/\\\x00-\x1f]+)$/.exec(headRef);
  if (!sameRepository || baseRef !== "main" || !match || [".", ".."].includes(match[1])) {
    throw new Error("CMS pull requests must belong to this repository and target a travel article on main.");
  }
  const article = `src/content/travel/${match[1]}.md`;
  const historicalImage = /^public\/images\/cms-trial\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i;
  if (!changes.some(({ path }) => path === article) || changes.some(({ status, path }) =>
    !["A", "M"].includes(status) || (path !== article && !historicalImage.test(path)))) {
    throw new Error("A CMS pull request may only add or update its own article and historical CMS images.");
  }
}

if (process.env.GITHUB_EVENT_PATH) {
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
      changes.push({ status: records[index], path: records[index + 1] });
    }
    validateCMSChanges({
      headRef: pull.head.ref,
      baseRef: pull.base.ref,
      sameRepository: pull.head.repo?.full_name === pull.base.repo?.full_name,
      changes,
    });
    console.log("CMS content changes passed.");
  } else {
    console.log("No CMS publication to check.");
  }
}
