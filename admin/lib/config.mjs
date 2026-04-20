import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, "..", "..");
export const runtimeDir = process.env.ADMIN_RUNTIME_DIR ?? "/var/lib/ricky-admin";
export const collections = {
  blog: {
    dir: path.join(projectRoot, "src/content/blog"),
    type: "blog",
  },
  research: {
    dir: path.join(projectRoot, "src/content/research"),
    type: "research",
  },
  travel: {
    dir: path.join(projectRoot, "src/content/travel"),
    type: "travel",
  },
};

export const publicImageRoot = path.join(projectRoot, "public/images");
export const staticDir = path.join(projectRoot, "admin/static");
export const adminPort = Number(process.env.ADMIN_PORT ?? "4322");
export const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
export const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? "";
export const sessionSecret = process.env.ADMIN_SESSION_SECRET ?? "";
export const sessionCookieName = "ricky_admin_session";
export const sessionTtlMs = 8 * 60 * 60 * 1000;
export const maxLoginFailures = 5;
export const lockoutMs = 24 * 60 * 60 * 1000;
export const securityStorePath = path.join(runtimeDir, "security.json");
export const sessionsStorePath = path.join(runtimeDir, "sessions.json");
export const publishLockPath = path.join(runtimeDir, "publish.lock");
export const maxUploadBytes = 15 * 1024 * 1024;
export const cookieSecure = process.env.ADMIN_COOKIE_SECURE !== "false";

export function ensureRuntimeSetup() {
  if (!adminPasswordHash || !sessionSecret) {
    throw new Error(
      "Missing ADMIN_PASSWORD_HASH or ADMIN_SESSION_SECRET in runtime environment.",
    );
  }

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(publicImageRoot, { recursive: true });
}
