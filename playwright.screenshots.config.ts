import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

// The README's screenshots, taken at phone size against the made-up unit the page tests use:
// npm run screenshots
export default defineConfig({
	...base,
	testDir: 'tests/screenshots',
	testMatch: '**/*.shots.ts',
	projects: [{ name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } }]
});
