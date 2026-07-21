export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: ["dist/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-undef": "error",
      "no-unused-vars": "error",
    },
  },
];
