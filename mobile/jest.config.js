/** Pure-logic tests only (scoring + HRV pipeline). No native/UI modules needed. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/lib'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', strict: true, esModuleInterop: true } }],
  },
};
