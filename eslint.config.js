import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      // Deno runtime — different type system, separately tested via
      // `supabase functions test`. Excluded from the browser-oriented lint.
      "supabase/functions/**",
      "supabase/migrations/**",
      "supabase/migrations-onprem/**",
      "e2e/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Peer-review checklist: rules-of-hooks is a hard error.
      "react-hooks/rules-of-hooks": "error",
      // exhaustive-deps is advisory (many legitimate intentional omissions).
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "warn",
      // Supabase generated types and third-party libs surface `any` in many
      // legitimate spots; treat as advisory rather than blocking CI.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      // shadcn/ui primitives declare empty extension interfaces; keep advisory.
      "@typescript-eslint/no-empty-object-type": "warn",
      // Intentional empty catches / no-op fallbacks are common in this codebase.
      "no-empty": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      // Third-party PDF regex patterns include combined characters legitimately.
      "no-misleading-character-class": "warn",
  },
);
