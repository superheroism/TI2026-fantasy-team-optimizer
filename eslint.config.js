import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['build/**', 'docs/**', 'engineering/history/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-useless-catch': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    rules: {
      'no-constant-binary-expression': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-useless-catch': 'error',
    },
  },
];
