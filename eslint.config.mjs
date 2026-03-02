// @ts-check
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  // Ignore auto-generated / non-source directories
  {
    ignores: [
      'temp/**',
      'library/**',
      'local/**',
      'build/**',
      'profiles/**',
      'settings/**',
      'node_modules/**',
    ],
  },

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Disable ESLint formatting rules that conflict with Prettier
  prettierConfig,

  // Prettier as an ESLint rule (formatting violations = lint errors)
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // Prettier formatting
      'prettier/prettier': 'warn',

      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
);
