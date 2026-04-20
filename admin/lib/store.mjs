import fs from "node:fs";

function readJson(pathname, fallback) {
  try {
    const raw = fs.readFileSync(pathname, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJsonAtomic(pathname, value) {
  const tempPath = `${pathname}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, pathname);
}

export function createJsonStore(pathname, fallback) {
  return {
    read() {
      return readJson(pathname, fallback);
    },
    write(value) {
      writeJsonAtomic(pathname, value);
    },
  };
}
