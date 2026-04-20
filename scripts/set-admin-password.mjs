import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const envPath = process.argv[2] ?? "/etc/ricky-admin.env";
const password = process.argv[3];

if (!password) {
  console.error("Usage: node scripts/set-admin-password.mjs [/path/to/env] <new-password>");
  process.exit(1);
}

const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const lines = current
  .split("\n")
  .filter(Boolean)
  .filter((line) => !line.startsWith("ADMIN_PASSWORD_HASH="));

const hash = await bcrypt.hash(password, 12);
lines.push(`ADMIN_PASSWORD_HASH=${hash}`);
fs.writeFileSync(envPath, `${lines.join("\n")}\n`);

console.log(`Updated ADMIN_PASSWORD_HASH in ${path.resolve(envPath)}`);
