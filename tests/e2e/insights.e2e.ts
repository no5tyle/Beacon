import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('analyses the unit as soon as it opens', async ({ page, isMobile }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	await expect(page.locator('.stat-tile').nth(1)).toContainText('Moving up within 6 months 1');

	// OAS gaps: how many have completed each stage, and who is next for each stage
	const camping = page.locator('.heatmap tr', { hasText: 'Camping' }).first();
	await expect(camping.locator('td').nth(1)).toHaveText('3/4');
	await camping.getByRole('button').click();
	await expect(page.locator('.stage-youth-row')).toContainText('Noah Jones');
	await expect(
		page.getByRole('heading', { name: 'Most common missing requirements' })
	).toBeVisible();

	// Priority youth: Ava moves up soon. Phones have room only for "Priority"
	const priority = page.getByRole('tab', { name: /Priority/ });
	await expect(priority).toHaveText(
		isMobile ? /^\s*Priority\s+1\s*$/ : /^\s*Priority youth\s+1\s*$/,
		// As it shows on screen, so a lost space or the hidden word on phones is caught
		{ useInnerText: true }
	);
	await priority.click();
	await expect(page.locator('.candidate-card')).toHaveCount(1);
	await expect(page.locator('.candidate-card h4')).toHaveText('Ava Nguyen');
	await expect(page.locator('.task-card').first()).toBeVisible();

	// Programming: skill themes and milestone balance
	await page.getByRole('tab', { name: 'Programming' }).click();
	await expect(
		page.getByRole('heading', { name: 'Skill themes across outstanding requirements' })
	).toBeVisible();
	await expect(page.locator('.bar-row')).not.toHaveCount(0);
});

test('focus youth join the priority list and are remembered', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	await page.getByRole('button', { name: 'Filters' }).click();
	await page.locator('.filter-row', { hasText: 'Mia Brown' }).locator('input').check();
	await expect(page.getByRole('button', { name: 'Filters, 1 set' })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();
	await page.getByRole('tab', { name: /Priority/ }).click();
	await expect(page.locator('.candidate-card h4')).toHaveText(['Ava Nguyen', 'Mia Brown focus']);
	expect(await page.evaluate(() => localStorage.getItem('insights-focus-youth-unit-1'))).toContain(
		'unit-1-m2'
	);
});

test('refresh loads every youth from Terrain again', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	const before = terrain.requests.filter((r) => r.includes('type=milestone')).length;
	await page.getByRole('button', { name: 'Refresh' }).click();
	await expect
		.poll(() => terrain.requests.filter((r) => r.includes('type=milestone')).length)
		.toBe(before + 4);
});
