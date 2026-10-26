import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test.beforeEach(async ({ page }) => {
	await fakeTerrain(page);
});

const pages = [
	'',
	'insights/',
	'oas/sign-off/',
	'record/activity/',
	'record/sia-plan/',
	'insights/stage/?stream=camping&stage=2',
	'progress/',
	'progress/unit-1-m0/',
	'progress/unit-1-m0/record-oas/',
	'oas-reference/',
	'approvals/',
	'logging/',
	'styles/'
];

test('every page fits the screen without scrolling sideways', async ({ page }) => {
	await logIn(page);
	for (const path of pages) {
		await navigate(page, path);
		await expect(page.locator('main h2').first()).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow, `sideways scroll on /${path}`).toBeLessThanOrEqual(0);
	}
});

test('dark mode follows the phone', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('login/');
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 20, 23)');
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('printing stays light when the phone is in dark mode', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await logIn(page);
	await navigate(page, 'progress/unit-1-m0/');
	const chip = page.locator('.task-chip.done').first();
	await expect(chip).toHaveCSS('background-color', 'rgb(22, 48, 31)');
	await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	await expect(chip).toHaveCSS('background-color', 'rgb(232, 245, 238)');
});

test('removes youth details an older version left on the device', async ({ page }) => {
	await page.goto('login/');
	await page.evaluate(() => {
		localStorage.setItem('unit-1_ApprovalsList', '[{"member_first_name":"Ava"}]');
		localStorage.setItem('LoginBranch', 'sa');
	});
	await page.goto('oas-reference/');
	await expect(page.locator('h2')).toHaveText('OAS reference');
	expect(await page.evaluate(() => localStorage.getItem('unit-1_ApprovalsList'))).toBeNull();
	expect(await page.evaluate(() => localStorage.getItem('LoginBranch'))).toBe('sa');
});

test("retires the Blazor Reference app's service worker and its cache", async ({ page }) => {
	await page.goto('login/');
	const result = await page.evaluate(async () => {
		// As a phone with the Blazor Reference app installed has: its cache, and a worker for reference/
		const cache = await caches.open('topo-reference-v1');
		await cache.put('/reference/', new Response('old Blazor Reference'));
		const scope = new URL('/reference/', location.href).href;
		await navigator.serviceWorker.register('/reference/service-worker.js', { scope });
		for (let i = 0; i < 50; i++) {
			const scopes = (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope);
			if (!scopes.includes(scope) && !(await caches.has('topo-reference-v1')))
				return { scopes, cacheLeft: false };
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return {
			scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
			cacheLeft: await caches.has('topo-reference-v1')
		};
	});
	expect(result.scopes.some((s) => s.endsWith('/reference/'))).toBe(false);
	expect(result.cacheLeft).toBe(false);
});

test('Beacon Reference has its own web app manifest', async ({ page }) => {
	await page.goto('login/');
	await expect(page.locator('link[rel=manifest]')).toHaveAttribute(
		'href',
		/\/manifest\.webmanifest$/
	);
	await page.goto('reference/');
	await expect(page.locator('link[rel=manifest]')).toHaveAttribute(
		'href',
		/\/reference\/manifest\.webmanifest$/
	);
});

test.describe('phone', () => {
	test.skip(({ isMobile }) => !isMobile, 'phone layout only');

	test('signed out, shows Beacon and the Reference but no tabs', async ({ page }) => {
		await page.goto('login/');
		await expect(page.locator('.top-bar')).toBeVisible();
		await expect(page.locator('.top-action')).toHaveText(/Reference/);
		await expect(page.locator('.tab-bar')).toHaveCount(0);
	});

	test('tab bar moves between pages and shows the current one', async ({ page }) => {
		await logIn(page);
		await expect(page.locator('.top-bar')).toHaveCount(0);
		// The labels: More also carries the approvals badge
		const tabs = page.locator('.tab-bar .tab .tab-label');
		await expect(tabs).toHaveText(['Home', 'Insights', 'Record', 'Progress', 'Reference', 'More']);
		await expect(page.locator('.tab-bar .tab.active')).toHaveText('Home');

		await page.locator('.tab-bar a', { hasText: 'Record' }).click();
		await expect(page).toHaveURL(/\/oas\/sign-off\/$/);
		await expect(page.locator('.tab-bar .tab.active')).toHaveText('Record');
	});

	test('More opens the less used pages, and Logout signs out', async ({ page }) => {
		await logIn(page);
		await page.locator('.tab-bar button', { hasText: 'More' }).click();
		await expect(page.locator('.more-item')).toHaveText([
			/^\s*Approvals 3 waiting for you\s*$/,
			/^\s*Logout\s*$/
		]);
		// Logging has no item of its own: the version opens it
		await page.locator('.more-version', { hasText: /^Beacon version / }).click();
		await expect(page).toHaveURL(/\/logging\/$/);
		await page.getByRole('button', { name: 'Start Logging' }).click();
		await page.locator('.tab-bar button', { hasText: 'More' }).click();
		await expect(page.locator('.more-version')).toHaveText(/^Beacon version .* · logging on$/);

		await page.locator('.more-item', { hasText: 'Logout' }).click();
		await expect(page).toHaveURL(/\/login\/$/);
		await expect(page.locator('.tab-bar')).toHaveCount(0);
		await page.goto('insights/');
		await expect(page, 'signed out pages go to the login').toHaveURL(/\/login\/$/);
	});
});

test.describe('desktop', () => {
	test.skip(({ isMobile }) => isMobile, 'desktop layout only');

	test('sidebar lists every page and the tab bar is hidden', async ({ page }) => {
		await page.goto('login/');
		await expect(page.locator('.side-link')).toHaveText(['Login', 'Reference']);
		await logIn(page);
		await navigate(page, 'insights/');
		await expect(page.locator('.side-link')).toHaveText(
			[
				'Home',
				'Insights',
				'Record',
				'Personal Progress',
				'Reference',
				'Approvals 3 waiting for you',
				'Logout'
			].map((name) => new RegExp(`^\\s*${name}\\s*$`))
		);
		await expect(page.locator('.side-link.active')).toHaveText('Insights');
		await expect(page.locator('.tab-bar')).toBeHidden();
		// Logging has no link of its own: the version opens it
		await page.locator('.side-version', { hasText: /^Version / }).click();
		await expect(page).toHaveURL(/\/logging\/$/);
	});
});
