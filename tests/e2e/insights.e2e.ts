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
		isMobile ? /^\s*Priority\s+1\s*$/ : /^\s*Priority\syouth\s+1\s*$/,
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

test('coming back to Insights shows the last analysis straight away', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	const asked = terrain.requests.length;

	await navigate(page, 'progress/');
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	expect(
		terrain.requests.slice(asked).filter((r) => r.includes('type=outdoor_adventure_skill')),
		"the unit's OAS records aren't asked for again"
	).toEqual([]);
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

test('Flow shows who moves up into and out of the unit each term, and the patrols that shrink', async ({
	page
}) => {
	const units = [
		{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' },
		{ id: 'cub-1', name: 'Mt Example Cubs', section: 'cub' }
	];
	await fakeTerrain(page, { units });
	await logIn(page);
	await page.selectOption('#page-unit', 'unit-1');
	await page.getByRole('tab', { name: 'Flow' }).click();
	const terms = page.locator('.chart > li');
	await expect(terms).toHaveCount(4);
	// Ava moves up to Venturers and Oscar and Ella come up from Cubs over the year; Jack isn't due yet
	const first = terms.first();
	await first.locator('summary').click();
	await expect(first.locator('.moves')).toBeVisible();
	await expect(page.locator('.chart')).toContainText('Ava Nguyen · Kookaburra');
	await expect(page.locator('.chart')).toContainText('Oscar Lee · Mt Example Cubs');
	await expect(page.locator('.chart')).toContainText('Ella Park');
	await expect(page.locator('.chart')).not.toContainText('Jack Wu');
	// Noah is in both units, so he isn't coming in
	await expect(page.locator('.chart')).not.toContainText('Noah Jones · Mt Example Cubs');
	await expect(page.locator('.notes')).toContainText(
		'1 youth in the Cubs is already in this unit too'
	);
	// Kookaburra loses Ava, so it's left smallest and listed first
	await expect(page.locator('table.patrols tbody tr').first()).toContainText(
		/Kookaburra\s*−1\s*2\s*Ava Nguyen/
	);
});

test('Flow without a leader role in the section below shows only youth moving up out', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/');
	await page.getByRole('tab', { name: 'Flow' }).click();
	await expect(page.locator('.alert-info')).toContainText(
		'Youth coming up from the Cubs show once you have a leader role in a Cub unit'
	);
	await expect(page.locator('.chart')).toContainText('Ava Nguyen');
	await expect(page.locator('.chart .bar.in')).toHaveCount(0);
});

test('Flow for Joeys shows only those moving up to Cubs', async ({ page }) => {
	await fakeTerrain(page, { units: [{ id: 'joey-1', name: 'Mt Example Joeys', section: 'joey' }] });
	await logIn(page);
	await navigate(page, 'insights/');
	await page.getByRole('tab', { name: 'Flow' }).click();
	await expect(page.locator('.alert-info')).toContainText('New Joeys join from outside Scouts');
	await expect(page.locator('.leaving')).toContainText(/Moving up to Cubs\s*1/);
	await expect(page.locator('.chart')).toContainText('Ruby Tan');
	// No side for youth coming in
	await expect(page.locator('.chart .bar.in')).toHaveCount(0);
	await expect(page.locator('.legend')).toHaveCount(0);
});
