/** Pure-logic tests only (scoring + HRV pipeline). No native/UI modules needed.
 *
 *  `src/dev` is in here for ONE file: `dev/beats.ts`, the synthetic beat series
 *  the marketing screenshot harness feeds through the real capture engine. The
 *  harness's whole claim is that only the intervals are invented and every
 *  number on a shot is genuinely computed from them, which is worth nothing if
 *  the series stops being physiological — so it is pinned like any other
 *  engine input. Nothing else under `src/dev` is testable here (it is React). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/lib', '<rootDir>/src/dev'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', strict: true, esModuleInterop: true } }],
  },
};
