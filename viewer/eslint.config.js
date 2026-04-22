// Flat-config ESLint for viewer. Minimal, dark-mode friendly.
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  fetch: "readonly",
  console: "readonly",
  HTMLElement: "readonly",
  HTMLButtonElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLDivElement: "readonly",
  KeyboardEvent: "readonly",
  MouseEvent: "readonly",
  Event: "readonly",
  URL: "readonly",
  Request: "readonly",
  Response: "readonly",
  AbortController: "readonly",
  // Worker is a standard browser global; needed by layout.worker.ts which
  // spawns elk's classic worker via `new Worker(elkWorkerUrl)` (post-fix
  // for the tree-layout-redesign worker hang, diagnosis 2026-04-22).
  Worker: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  Storage: "readonly",
  URLSearchParams: "readonly",
  JSX: "readonly",
};

const nodeGlobals = {
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "readonly",
  require: "readonly",
  global: "readonly",
  Buffer: "readonly",
};

export default [
  {
    ignores: [
      "dist",
      "node_modules",
      "test-results",
      "playwright-report",
      "e2e/**",
      // stale compiled outputs from prior tsc -b runs
      "**/*.d.ts",
      "vite.config.js",
      "vitest.config.js",
      "tailwind.config.js",
      "postcss.config.cjs",
      "playwright.config.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // tests have access to both browser and node-ish test globals
    files: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...browserGlobals, ...nodeGlobals },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // config files run under node
    files: [
      "vite.config.ts",
      "vitest.config.ts",
      "tailwind.config.ts",
      "postcss.config.js",
      "playwright.config.ts",
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
];
