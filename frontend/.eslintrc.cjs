module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@nuxt/eslint-config',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': [
      'warn',
      { allowExpressions: true },
    ],
    'vue/multi-word-component-names': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    complexity: ['warn', 10],
    'max-lines-per-function': [
      'warn',
      { max: 60, skipBlankLines: true, skipComments: true },
    ],
  },
  ignorePatterns: ['.nuxt', '.output', 'dist', 'node_modules', 'coverage'],
}
