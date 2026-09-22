import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dbFile = path.join(__dirname, "..", "prisma", "test.db");

export function setup() {
  for (const f of [dbFile, `${dbFile}-journal`]) fs.rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}

export function teardown() {
  for (const f of [dbFile, `${dbFile}-journal`]) fs.rmSync(f, { force: true });
}
