import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('a heatmap cell opens the stage, with its statements in the order worth programming', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/');
	const camping = page.locator('.heatmap tr', { hasText: 'Camping' }).first();
	await camping.locator('td').nth(2).getByRole('link').click();

	await expect(page.locator('h2')).toHaveText('Camping Stage 2');
	// Liam has started it and Mia hasn't; Ava is past it and Noah hasn't done Stage 1
	const tiles = page.locator('.stat-tile');
	await expect(tiles.nth(0)).toContainText('Next stage for 2');
	await expect(tiles.nth(1)).toContainText('Started 1');

	// Statements both still need come before the ones only Mia needs
	const ranked = page.locator('.ranked .statement');
	await expect(ranked).toHaveCount(7);
	await expect(ranked.first()).toContainText('I can use a map and compass to find my way.');
	await expect(ranked.first()).toContainText('Needed by 2 of 2');
	await expect(ranked.last()).toContainText('Needed by 1 of 2');

	await ranked.first().locator('.statement-text').click();
	await expect(ranked.first().locator('.detail')).toHaveText(
		'Show the youth can orient the map and take a bearing.'
	);
	await expect(ranked.first().locator('.who li')).toHaveText([
		/Liam Smith/,
		/Mia Brown.*not started/
	]);

	// Patrols narrow it down
	await page.getByRole('button', { name: 'Wombat' }).click();
	await expect(tiles.nth(0)).toContainText('Next stage for 1');
	await page.getByRole('button', { name: 'Everyone' }).click();
	await expect(tiles.nth(0)).toContainText('Next stage for 2');
});

test('signing off from a stage picks the statements and the youth who need them', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/stage/?stream=camping&stage=2');
	const ranked = page.locator('.ranked .statement');
	await ranked.nth(0).locator('input').check();
	await ranked.nth(1).locator('input').check();
	await expect(page.locator('.action-bar')).toContainText('2 statements, 2 youth');
	await page.getByRole('button', { name: 'Sign these off' }).click();

	await expect(page).toHaveURL(/\/oas\/sign-off\/\?template=/);
	await expect(page.locator('.subtitle')).toContainText('Camping Stage 2 · 2 statements');
	await expect(page.locator('.pick-row', { hasText: 'Liam Smith' }).locator('input')).toBeChecked();
	await expect(page.locator('.pick-row', { hasText: 'Mia Brown' }).locator('input')).toBeChecked();
	await page.getByRole('button', { name: 'Review 2 youth' }).click();
	await page.getByRole('button', { name: 'Sign off 2 youth' }).click();
	await expect(page.locator('.result-row')).toHaveCount(2);
	await expect(page.locator('.result-row', { hasText: 'Mia Brown' })).toContainText(
		'Saved 2 statements'
	);
	expect(terrain.writes.filter((w) => w.request.includes('/achievements'))).toHaveLength(2);
});

test('Record OAS links to the stage to see which statements come first', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	await page.getByRole('button', { name: 'Bushwalking', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 4', exact: true }).click();
	await page.getByRole('link', { name: 'Which first?' }).click();
	await expect(page.locator('h2')).toHaveText('Bushwalking Stage 4');
	// Ava is working on it, with 4 of 7 statements saved
	await expect(page.locator('.stat-tile').nth(1)).toContainText('Started 1');
	await expect(page.locator('.ranked .statement')).toHaveCount(3);
});

test("Insights' filters carry over to a stage for the rest of the tab", async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'insights/stage/?stream=bushwalking&stage=4');
	const ava = page.locator('.ranked .statement').first();
	await ava.locator('.statement-text').click();
	// Ava turns 15 in about two months, so she is moving up soon by default
	await expect(ava.locator('.who li', { hasText: 'Ava Nguyen' })).toContainText('moving up');

	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	await page.getByRole('button', { name: 'Filters' }).click();
	await page.getByText('Advanced settings').click();
	await page.getByLabel('Moving up window (months)').fill('1');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.locator('.stat-tile').nth(1)).toContainText('Moving up within 1 months 0');

	await navigate(page, 'insights/stage/?stream=bushwalking&stage=4');
	await page.locator('.ranked .statement').first().locator('.statement-text').click();
	await expect(
		page.locator('.ranked .statement').first().locator('.who li', { hasText: 'Ava Nguyen' })
	).not.toContainText('moving up');

	// And back on Insights the filter is still set
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').nth(1)).toContainText('Moving up within 1 months 0');
});
