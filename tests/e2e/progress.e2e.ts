import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('Progress lists the youth, and each opens their details', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await expect(page.locator('h2')).toHaveText('Progress (Mt Example Scouts)');
	const cards = page.locator('.youth');
	await expect(cards).toHaveCount(4);
	await expect(cards.locator('.strong')).toHaveText([
		'Ava Nguyen',
		'Liam Smith',
		'Mia Brown',
		'Noah Jones'
	]);
	await expect(cards.first()).toContainText(/Member Number\s*100/);
	await expect(cards.first()).toContainText(/Patrol\s*Kookaburra/);
	await expect(cards.first()).toContainText(/Role\s*PL/);
	await expect(cards.first()).toContainText(/Unit Council\s*Yes/);

	await cards.first().click();
	await expect(page.locator('h2')).toHaveText('Progress Details for Ava Nguyen');
	await expect(page).toHaveURL(/\/progress\/unit-1-m0\/$/);
});

test('youth details show insights, milestones, OAS, statistics, SIA and peak award', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await page.locator('.youth').first().click();

	const insights = page.locator('.insights-card');
	await expect(insights.getByRole('heading', { name: 'Milestone 2' })).toBeVisible();
	await expect(insights.getByRole('heading', { name: /Australian Scout Award/ })).toBeVisible();
	await expect(insights.getByText('Outstanding OAS requirements')).toBeVisible();
	await expect(insights.locator('.stage-detail').first()).toContainText('Bushwalking 4');
	await expect(insights.locator('.stage-detail').first()).toContainText('4/7 done');

	const oas = page.locator('section', { hasText: 'Outdoor Adventure Skills' });
	const bushwalking = oas.locator('tr', { hasText: 'Bushwalking:' });
	await expect(bushwalking.locator('td').nth(1)).toHaveText(/^\d\d\/\d\d\/\d\d s$/);
	await expect(bushwalking.locator('td').nth(4)).toHaveText('Started');
	// Non-core streams show once asked for
	await expect(oas.locator('tr', { hasText: 'Cycling:' })).toHaveCount(0);
	await page.getByLabel('Include non-core OAS').check();
	await expect(oas.locator('tr', { hasText: 'Cycling:' })).toHaveCount(1);

	const milestones = page.locator('section', { hasText: 'Milestones' });
	await expect(milestones.locator('.milestone-head')).toHaveText([
		/Milestone 1: Awarded\s+\d\d\/\d\d\/\d\d/,
		/Milestone 2: In Progress\s*$/
	]);
	await expect(milestones).toContainText('Cooking night 1');
	await expect(milestones).toContainText('(PG)');

	const stats = page.locator('section', { hasText: 'Statistics' });
	await expect(stats).toContainText('KMs Hiked: 42');
	await expect(stats).toContainText('Nights Camped: 9');
	await expect(stats).toContainText('Progressions: 9');

	const sia = page.locator('section', { hasText: 'Special Interest Areas' });
	await expect(sia.locator('tbody tr')).toHaveCount(2);
	await expect(sia.locator('tbody tr').first()).toContainText('Environment');

	const peak = page.locator('section', { hasText: 'Peak Award' }).last();
	await expect(peak).toContainText(/Personal Development Course:\s*\d\d\/\d\d\/\d\d/);

	await page.getByRole('link', { name: 'Back' }).click();
	await expect(page.locator('h2')).toHaveText('Progress (Mt Example Scouts)');
});

test('a youth member sees their own progress, without recording', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await navigate(page, 'progress/');
	await expect(page.locator('.youth')).toHaveCount(1);
	await page.locator('.youth').click();
	await expect(page.locator('h2')).toHaveText('Progress Details for Ava Nguyen');
	await expect(page.locator('.stage-detail').first()).toBeVisible();
	await expect(page.locator('a[href$="/record-oas/"]')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Record statements' })).toHaveCount(0);
});
