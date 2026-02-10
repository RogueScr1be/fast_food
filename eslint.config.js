/**
 * ESLint flat config (v9+)
 * Minimal, RN-safe, Vercel-safe
 */
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const hooksPlugin = require('eslint-plugin-react-hooks');

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
      'components/AnimatedCard.tsx',
      'components/ReceiptScanner.tsx',
      'components/LocationPicker.tsx',
      'components/PerformanceDebugger.tsx',
      'components/SuggestionChips.tsx',
      'components/GradientButton.tsx',
      'app/components/**'
      'react-hooks/exhaustive-deps': 'off',
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': hooksPlugin
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
