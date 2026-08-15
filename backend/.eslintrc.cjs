/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.jest.json',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:@typescript-eslint/recommended-requiring-type-checking', 'prettier'],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/', '.esbuild/', '.serverless/'],
  rules: {
    // Code-quality bar from docs/CONTRACTS.md: no `any`, explicit return types,
    // small functions, no magic numbers, no silent catches.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
    complexity: ['warn', 10],
    'no-magic-numbers': [
      'warn',
      {
        ignore: [-1, 0, 1, 2],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true,
        detectObjects: false,
      },
    ],
    'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
    'no-empty': ['error', { allowEmptyCatch: false }],
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        'max-lines-per-function': 'off',
        'no-magic-numbers': 'off',
      },
    },
  ],
};
