import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/.next/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/{api,worker}/src/**/*.ts", "packages/*/src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);
