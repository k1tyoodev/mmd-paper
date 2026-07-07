import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// https://vite.dev/config/
export default defineConfig({
  lint: {
    plugins: ["typescript", "react", "unicorn"],
    categories: {
      correctness: "error",
      suspicious: "warn",
      perf: "warn",
    },
    env: {
      browser: true,
      builtin: true,
      es2024: true,
      node: true,
    },
    ignorePatterns: ["**/dist/**", "**/dist-ssr/**", "**/coverage/**"],
    rules: {
      "no-array-constructor": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/consistent-return": "off",
      "typescript/no-empty-object-type": "error",
      "typescript/no-explicit-any": "warn",
      "typescript/no-namespace": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-unnecessary-type-assertion": "off",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unnecessary-type-conversion": "off",
      "typescript/no-unsafe-type-assertion": "off",
      "typescript/no-unsafe-function-type": "error",
      "react/jsx-key": "error",
      "react/react-in-jsx-scope": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
        rules: {
          "constructor-super": "off",
          "getter-return": "off",
          "no-class-assign": "off",
          "no-const-assign": "off",
          "no-dupe-class-members": "off",
          "no-dupe-keys": "off",
          "no-func-assign": "off",
          "no-import-assign": "off",
          "no-new-native-nonconstructor": "off",
          "no-obj-calls": "off",
          "no-redeclare": "off",
          "no-setter-return": "off",
          "no-this-before-super": "off",
          "no-undef": "off",
          "no-unreachable": "off",
          "no-unsafe-negation": "off",
          "no-var": "error",
          "no-with": "off",
          "prefer-const": "error",
          "prefer-rest-params": "error",
          "prefer-spread": "error",
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  plugins: [tailwindcss(), react()],
  build: {
    // Monaco + diagram runtime are intentionally split into dedicated async chunks.
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Raise split threshold to reduce small fragmented chunks.
          minSize: 80_000,
          groups: [
            {
              name: "editor-monaco",
              // Keep Monaco core + tiny virtual bridge together for stable editor cacheability.
              test: /(node_modules[\\/]monaco-editor|virtual:monaco-editor|_virtual_monaco-editor)/,
              priority: 100,
            },
            {
              // Merge all Shiki theme modules into one chunk, independent from Shiki runtime.
              name: "editor-shiki-themes",
              test: /node_modules[\\/]@shikijs[\\/]themes/,
              priority: 98,
            },
            {
              // JavaScript regex engine for browsers with lookbehind support.
              name: "editor-shiki-engine-js",
              test: /node_modules[\\/](@shikijs[\\/]engine-javascript|oniguruma-to-es)/,
              priority: 97,
            },
            {
              // Oniguruma regex engine fallback for browsers without lookbehind support.
              name: "editor-shiki-engine-onig",
              test: /node_modules[\\/](@shikijs[\\/]engine-oniguruma|vscode-oniguruma|shiki[\\/]dist[\\/]engine-oniguruma)/,
              priority: 96,
            },
            {
              // Shiki runtime stays separate from theme payload.
              name: "editor-shiki-runtime",
              test: /(virtual:shiki|_virtual_shiki|node_modules[\\/](@shikijs(?![\\/]themes|[\\/]engine-javascript|[\\/]engine-oniguruma)|shiki(?![\\/]dist[\\/]engine-oniguruma)|shiki-codegen))/,
              priority: 94,
            },
            {
              // beautiful-mermaid currently statically imports elkjs, so they must stay together.
              name: "renderer-core",
              test: /node_modules[\\/](beautiful-mermaid|elkjs|entities)/,
              priority: 90,
            },
            {
              name: "react-runtime",
              test: /node_modules[\\/](react|react-dom|scheduler)/,
              priority: 30,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
