import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn(`.env file not found at ${envPath}, skipping dotenv configuration.`);
}

export default defineConfig({
  expect: {
    timeout: 2500,
  },
  testDir: __dirname,
  testIgnore: ['assets/**'],
  timeout: 15_000,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  preserveOutput: process.env.CI ? 'failures-only' : 'always',
  fullyParallel: true,
  projects: [
    {
      name: 'playwright-azure-reporter-test',
    },
  ],
  reporter: process.env.CI ? [['dot']] : [['list']],
});
