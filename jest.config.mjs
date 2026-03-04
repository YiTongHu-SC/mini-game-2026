/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/assets/scripts'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Stub Cocos Creator module for pure-logic unit tests
    '^cc$': '<rootDir>/tests/__mocks__/cc.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          experimentalDecorators: true,
          types: ['jest'],
        },
      },
    ],
  },
};
