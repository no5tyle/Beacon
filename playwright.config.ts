import { defineConfig, devices } from '@playwright/test';

// Page tests run against the built app, at phone and desktop sizes
export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		baseURL: 'http://localhost:4173',
		// Use an already installed Chromium where one is provided, e.g. in a dev container
		...(process.env.PLAYWRIGHT_CHROMIUM_PATH
			? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
			: {})
	},
	projects: [
		{ name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
		{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }
	]
});
