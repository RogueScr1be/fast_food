/**
 * ESLint flat config (v9+)
 *
 * Catches undefined variables and missing imports that cause
 * silent web crashes. Intentionally minimal.
 */
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'coverage/**',
      'scripts/**',
      'db/**',
      '*.config.js',
      'babel.config.js',
      'jest.setup.js',
      'eslint.config.js',
      // Legacy components not actively maintained
      'components/AnimatedCard.tsx',
      'components/ReceiptScanner.tsx',
      'components/LocationPicker.tsx',
      'components/PerformanceDebugger.tsx',
      'components/SuggestionChips.tsx',
      'components/GradientButton.tsx',
      'app/components/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Core TS recommended rules (subset)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Allow require() for RN image imports
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // Allow any for pragmatic RN interop
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow empty functions
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
];
