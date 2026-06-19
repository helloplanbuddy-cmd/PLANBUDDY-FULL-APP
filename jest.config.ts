// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset:              'ts-jest',
  testEnvironment:     'node',
  roots:               ['<rootDir>/__tests__'],
  testMatch:           ['**/*.test.ts', '**/*.spec.ts'],
  transform:           {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        strict: true,
        jsx: 'react-jsx',   // enable JSX transform for .tsx files in tests
      },
    }],
  },
  moduleNameMapper:    { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterEnv: [],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    '!lib/db.ts',         // Prisma client — tested via integration
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 75, lines: 75, statements: 75 },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};

export default config;
