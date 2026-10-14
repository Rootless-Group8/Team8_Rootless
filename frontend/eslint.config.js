import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Test files use Vitest's globals (describe/it/expect/beforeEach/vi),
    // configured in vite.config.js's `test.globals: true` — but that only
    // affects the test RUNNER, not ESLint, which is a separate tool with
    // its own config. Without this block, every test file reports false
    // "no-undef" errors for describe/it/expect, which is exactly what was
    // happening before this fix.
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.vitest },
    },
  },
])