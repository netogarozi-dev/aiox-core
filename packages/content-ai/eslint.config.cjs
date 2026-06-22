// ESLint config for ESM package (Node 18+)
'use strict';

const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-undef': 'error',
      'no-console': 'off',
      semi: ['error', 'always'],
      quotes: ['warn', 'single', { avoidEscape: true }],
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        it: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
