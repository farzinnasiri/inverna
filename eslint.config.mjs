// A few rules that catch real bugs. No style rules: formatting isn't linted.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'ios', 'android', 'public', '.expo', 'scripts', '*.config.*', 'design'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tseslint.plugin },
    rules: {
      // Hooks called conditionally break state in ways tests rarely catch.
      'react-hooks/rules-of-hooks': 'error',
      // Shown, not failing: some omissions are deliberate (commented where they are).
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // The pure core: same input, same output. Time and randomness come in as arguments.
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use createRng from src/core/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Pass the time in as an argument.' },
      ],
    },
  },
  {
    // An unawaited promise here is a sound or a save that silently fails.
    files: ['src/platform/**/*.ts', 'src/ui/state/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.web.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
)
