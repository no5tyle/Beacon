import { expect, test } from '@playwright/test';
import { fakeTerrain } from './terrain.js';

test('the Reference works signed out, and filters and expands statements', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('oas-reference/');
	await expect(page.locator('h2')).toHaveText('OAS reference');
	// Core streams, 9 stages each, 6 statements a stage
	await expect(page.getByText('162 statements')).toBeVisible();

	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.selectOption('#part', 'Do');
	await expect(page.getByText('9 statements')).toBeVisible();
	await expect(page).toHaveURL(/stage=2&part=Do/);

	await page.locator('#search').fill('compass');
	await expect(page.getByText('3 statements')).toBeVisible();
	const statement = page.locator('.statement').first();
	await statement.locator('.statement-text').click();
	await expect(statement.locator('.statement-detail')).toHaveText(
		'Show the youth can orient the map and take a bearing.'
	);
});

test('starred statements are kept, and listed on their own', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('oas-reference/?stream=camping&stage=1');
	await expect(page.getByText('6 statements')).toBeVisible();
	await page.locator('.statement').first().getByRole('button', { name: 'Star' }).click();
	await page.getByRole('button', { name: '★ Starred (1)' }).click();
	await expect(page.locator('.starred-banner')).toBeVisible();
	await expect(page.locator('.statement')).toHaveCount(1);

	await page.reload();
	await expect(page.getByRole('button', { name: '★ Starred (1)' })).toBeVisible();
	await expect(page.locator('.statement')).toHaveCount(1);
});

test('a shared statement opens on its stage, expanded', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('reference/?s=bushwalking%2F3%3Abushwalking_3_map');
	await expect(page.locator('.app-title')).toHaveText('Beacon Reference');
	await expect(page.locator('.tab-bar, .sidebar')).toHaveCount(0);
	const open = page.locator('.statement.open');
	await expect(open).toHaveCount(1);
	await expect(open).toContainText('I can use a map and compass to find my way.');
	await expect(page.locator('.stage-title')).toHaveText('Bushwalking Stage 3');
});

test('the Reference app keeps its filters behind the menu', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('reference/');
	await expect(page.locator('#stream')).toHaveCount(0);
	await page.getByRole('button', { name: 'Filters' }).click();
	await page.selectOption('#where', 'UnitNight');
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.locator('.app-filter-count')).toHaveText('1');
	await expect(page.locator('.statement .badge-success').first()).toHaveText('unit night');
});
