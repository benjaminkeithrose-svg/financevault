import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: "./test/globalSetup.ts",
    // A throwaway database and storage folder, so running the tests can
    // never touch real records or documents.
    env: {
      DATABASE_URL: "file:./test.db",
      STORAGE_DIR: path.join(os.tmpdir(), "financevault-test-storage"),
    },
    // One SQLite file is shared, so test files run one at a time.
    fileParallelism: false,
    // scrypt is deliberately slow; vault tests run several derivations.
    testTimeout: 30_000,
  },
});
