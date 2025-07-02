const { defineConfig, globalIgnores } = require('eslint/config');

const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const js = require('@eslint/js');

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        NodeJS: true,
      },

      parser: tsParser,
      ecmaVersion: 12,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest',
      },
    },

    extends: compat.extends('eslint:recommended'),

    plugins: {
      '@typescript-eslint': typescriptEslint,
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      'no-async-promise-executor': 0,
      'no-control-regex': 0,
      'no-empty-pattern': 0,
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-unused-vars': 'off',
      'no-constant-binary-expression': 'off',
    },
  },
  globalIgnores(['**/dist', '**/node_modules', 'test-results']),
]);
