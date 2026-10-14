import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The database tests each start a real Postgres; give them time when run together.
  test: { environment: "node", hookTimeout: 60_000, testTimeout: 30_000 },
});
