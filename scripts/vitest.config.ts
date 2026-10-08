import { defineConfig } from 'vitest/config';

// Long-running balance experiments, kept out of `npm test`. Run with: npm run bias
export default defineConfig({ test: { environment: 'node', root: '.', include: ['scripts/*.test.ts'] } });
