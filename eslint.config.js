const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      '**/.DS_Store',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.map',
      '.vscode/**',
      '.git/**',
      '.husky/**',
      '**/*.d.ts',
    ],
  },

  // Configuration for TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        console: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // ESLint recommended rules
      'no-unused-vars': 'off', // Turn off base rule as it can report incorrect errors

      // Custom rules from your old config
      'no-async-promise-executor': 'off',
      'no-control-regex': 'off',
      'no-empty-pattern': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
