// ESLint flat config. Three environments: the main process and shared code are CommonJS on Node,
// the renderer is ES modules in the browser (bundled by esbuild), tests and scripts are Node.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'release/', 'mockups/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }]
    }
  },
  {
    files: ['src/main/**/*.js', 'src/shared/**/*.js', 'scripts/**/*.js', 'test/unit/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  {
    // Code passed to page.evaluate()/waitForFunction() runs in the renderer.
    files: ['test/e2e/**/*.mjs', 'test/perf/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser } }
  }
];
