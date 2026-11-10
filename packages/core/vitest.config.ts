import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Online-Tests teilen sich einen Browser; nicht parallel ausführen.
    fileParallelism: false,
  },
});
