import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["pruebas/unitarias/**/*.test.ts"],
    environment: "node",
  },
});
