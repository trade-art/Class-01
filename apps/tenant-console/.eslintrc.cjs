/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    // 允许 any 类型（逐步迁移）
    '@typescript-eslint/no-explicit-any': 'off',
    // 允许未使用变量以下划线开头
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Vue 组件命名规则
    'vue/multi-word-component-names': 'off',
    // 允许 v-html
    'vue/no-v-html': 'off'
  },
  ignorePatterns: ['dist/', 'node_modules/']
}
