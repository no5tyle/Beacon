import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('Patrols lists the youth in each patrol, leaders first, with their progress', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'patrols/');
	await expect(page.locator('h2')).toHaveText('Patrols (Mt Example Scouts)');

	const patrols = page.locator('section.patrol');
	await expect(patrols.locator('h3')).toHaveText(['Kookaburra', 'Wombat']);
	const kookaburra = patrols.filter({ hasText: 'Kookaburra' });
	await expect(kookaburra.locator('.patrol-head')).toContainText('2 youth');
	// The patrol leader first, then everyone else
	await expect(kookaburra.locator('.member .row-main')).toHaveText([
		/Ava\s+Nguyen\s*PL/,
		/Liam\s+Smith/
	]);
	const wombat = patrols.filter({ hasText: 'Wombat' });
	await expect(wombat.locator('.member .row-main')).toHaveText([
		/Mia\s+Brown\s*APL/,
		/Noah\s+Jones/
	]);

	// Award progress once the unit's progress is loaded, and who's moving up soon
	await expect(kookaburra.locator('.member', { hasText: 'Ava' }).locator('.percent')).toHaveText(
		'48%'
	);
	await expect(kookaburra.locator('.member', { hasText: 'Ava' }).locator('.move-up')).toHaveText(
		/^Moves up in (1|2)m$/
	);
	await expect(kookaburra.locator('.summary')).toContainText('1 moving up within 6 months');
	await expect(kookaburra.locator('.summary')).toContainText(/Australian Scout Award average \d+%/);

	// Each youth opens their progress
	await kookaburra.locator('.member', { hasText: 'Liam' }).click();
	await expect(page).toHaveURL(/\/progress\/unit-1-m1\/$/);
});
