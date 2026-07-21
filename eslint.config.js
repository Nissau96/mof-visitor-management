import { fixupPluginRules } from "@eslint/compat";
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".vercel/**",
    ],
  },

  // React browser application
  {
    files: ["src/**/*.{js,jsx}"],

    plugins: {
      react: fixupPluginRules(react),
      "react-hooks": fixupPluginRules(reactHooks),
      "react-refresh": fixupPluginRules(reactRefresh),
    },

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,

      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs["recommended-latest"].rules,
      ...reactRefresh.configs.vite.rules,

      "react/prop-types": "off",
    },
  },

  // Vercel server functions and Node.js scripts
  {
    files: [
      "api/**/*.js",
      "scripts/**/*.{js,mjs}",
    ],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },

    rules: {
      ...js.configs.recommended.rules,
    },
  },

  // Root-level configuration files
  {
    files: [
      "*.config.js",
      "*.config.mjs",
      "vite.config.js",
    ],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },

    rules: {
      ...js.configs.recommended.rules,
    },
  },
];