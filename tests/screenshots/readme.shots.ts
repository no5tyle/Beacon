// Takes the README's screenshots into docs/screenshots. Every name in them is made up, from the same fake
// Terrain the page tests use.
import { expect, test, type Page } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from '../e2e/terrain.js';

const shot = (page: Page, name: string) =>
	page.screenshot({ path: `docs/screenshots/${name}.png`, animations: 'disabled' });

/** Scrolls the page so this is at the top of the screen */
const scrollTo = (page: Page, selector: string) =>
	page
		.locator(selector)
		.first()
		.evaluate((el) => {
			el.scrollIntoView({ block: 'start' });
			window.scrollBy(0, -12);
		});

// Sharp on a phone screen without making the README heavy
test.use({ colorScheme: 'light', deviceScaleFactor: 2 });

test.beforeEach(async ({ page }) => {
	await fakeTerrain(page, { moreAwards: true });
	await logIn(page);
});

test('home', async ({ page }) => {
	await page.getByRole('button', { name: "Don't show again" }).click();
	await expect(page.locator('h2').first()).toBeVisible();
	await shot(page, 'home');
});

test('insights', async ({ page }) => {
	await navigate(page, 'insights/');
	await expect(page.locator('.heatmap')).toBeVisible();
	await scrollTo(page, 'h3:has-text("Unit completion")');
	await shot(page, 'insights');
});

test('record OAS', async ({ page }) => {
	await navigate(page, 'oas/sign-off/');
	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can help plan a menu for a camping activity.').check();
	await page.getByLabel('I can pack the gear I need for a camping activity.').check();
	await page.evaluate(() => window.scrollTo(0, 0));
	// Off the stage buttons, which would otherwise show as hovered where the last tap was
	await page.mouse.move(0, 0);
	await shot(page, 'record-oas');
});

test('personal progress', async ({ page }) => {
	await navigate(page, 'progress/');
	await page.locator('.youth').first().click();
	await expect(page.locator('.stage-detail').first()).toBeVisible();
	await shot(page, 'progress');
});

test('approvals', async ({ page }) => {
	await navigate(page, 'approvals/');
	await expect(page.locator('.approval-card').first()).toBeVisible();
	await shot(page, 'approvals');
});

test('reference', async ({ page }) => {
	await navigate(page, 'oas-reference/');
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	const statement = page.locator('.statement', { hasText: 'map and compass' }).first();
	await statement.locator('.statement-text').click();
	await expect(statement.locator('.statement-detail')).toBeVisible();
	await scrollTo(page, '.statement');
	await page.evaluate(() => window.scrollBy(0, -40));
	await shot(page, 'reference');
});
