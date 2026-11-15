import { lstat, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const legacyDirectories = ["admin", "cms-trial"];

/** Retire copied v1 editors only in a completed Payload-backed static build. */
export async function retireLegacyAdmin({ dir, projectRoot, contentSource }) {
  if (contentSource === "legacy") return { removed: [] };
  if (contentSource !== "payload") throw new Error("Unknown content source for editor retirement.");
  if (!(dir instanceof URL) || dir.protocol !== "file:") {
    throw new Error("Editor retirement requires Astro's file build-directory URL.");
  }
  const requestedOutput = path.resolve(fileURLToPath(dir));
  const outputStat = await lstat(requestedOutput);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw new Error("Editor retirement requires a real output directory.");
  }
  const output = await realpath(requestedOutput);
  const project = await realpath(projectRoot);
  const projectFromOutput = path.relative(output, project);
  if (output === path.parse(output).root || projectFromOutput === "" ||
      (!projectFromOutput.startsWith(`..${path.sep}`) && projectFromOutput !== ".." && !path.isAbsolute(projectFromOutput))) {
    throw new Error("Editor retirement cannot target the project or an ancestor directory.");
  }
  const index = await lstat(path.join(output, "index.html"));
  if (!index.isFile() || index.isSymbolicLink()) {
    throw new Error("Editor retirement requires a completed static homepage.");
  }

  // Names are fixed, not derived from environment variables or URL parameters.
  // rm unlinks a directory symlink itself, without following its target.
  for (const name of legacyDirectories) {
    await rm(path.join(output, name), { recursive: true, force: true });
  }
  return { removed: [...legacyDirectories] };
}
