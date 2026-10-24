import { expect, test } from '@playwright/test';

const pages = [
	'',
	'insights/',
	'oas/sign-off/',
	'progress/',
	'oas-reference/',
	'logging/',
	'styles/'
];

test('every page fits the screen without scrolling sideways', async ({ page }) => {
	for (const path of pages) {
		await page.goto(path);
		await expect(page.locator('main h2')).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow, `sideways scroll on /${path}`).toBeLessThanOrEqual(0);
	}
});

test('dark mode follows the phone', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('');
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 20, 23)');
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('Beacon Reference has its own web app manifest', async ({ page }) => {
	await page.goto('');
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

	test('tab bar moves between pages and shows the current one', async ({ page }) => {
		await page.goto('');
		const tabs = page.locator('.tab-bar .tab');
		await expect(tabs).toHaveText(['Home', 'Insights', 'Record', 'Progress', 'Reference', 'More']);
		await expect(page.locator('.tab-bar .tab.active')).toHaveText('Home');

		await page.locator('.tab-bar a', { hasText: 'Record' }).click();
		await expect(page).toHaveURL(/\/oas\/sign-off\/$/);
		await expect(page.locator('.tab-bar .tab.active')).toHaveText('Record');
		await expect(page.locator('.sidebar')).toBeHidden();
	});

	test('More opens a menu of the less used pages and the version', async ({ page }) => {
		await page.goto('');
		await page.locator('.tab-bar button', { hasText: 'More' }).click();
		await expect(page.locator('.more-item')).toHaveText(['Turn on logging', 'Logout']);
		await expect(page.locator('.more-version')).toHaveText(/^Beacon version /);

		await page.locator('.more-item', { hasText: 'logging' }).click();
		await expect(page).toHaveURL(/\/logging\/$/);
		await expect(page.locator('.more-menu')).toBeHidden();
		await expect(page.locator('.tab-bar .tab.active')).toHaveText('More');
	});
});

test.describe('desktop', () => {
	test.skip(({ isMobile }) => isMobile, 'desktop layout only');

	test('sidebar lists every page and the tab bar is hidden', async ({ page }) => {
		await page.goto('insights/');
		await expect(page.locator('.side-link')).toHaveText([
			'Home',
			'Insights',
			'Record OAS',
			'Personal Progress',
			'Reference',
			'Turn on logging',
			'Logout'
		]);
		await expect(page.locator('.side-link.active')).toHaveText('Insights');
		await expect(page.locator('.tab-bar')).toBeHidden();
	});
});
