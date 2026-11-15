const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'ios/**', 'android/**', 'build-out/**', 'dist/**'],
  },
  {
    // eslint-config-expo 58 turns on the React Compiler's rule set
    // (eslint-plugin-react-hooks 7). This app does not run the compiler
    // (`experiments.reactCompiler` is unset), and several of its load-bearing
    // patterns are exactly what those rules forbid: a ref kept current during
    // render (`focusedRef.current = focused`), and Reanimated shared values,
    // whose whole API is assigning `.value` (flagged as mutating a hook's
    // return). They flagged ~240 existing sites on the day of the upgrade and
    // none of them is a bug. Revisit together with adopting the compiler, not
    // one rule at a time.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/globals': 'off',
    },
  },
  {
    // `import/namespace` cannot follow expo-notifications' `export *` of a
    // `.types` module that declares enums; TypeScript resolves both members
    // and typechecks them.
    files: ['src/lib/reminders.ts', 'src/store/cycle.ts', 'src/store/pacingAlerts.ts'],
    rules: { 'import/namespace': 'off' },
  },
]);
