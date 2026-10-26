import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('signs off statements for several youth at once', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	await expect(page.locator('h2')).toHaveText('Record OAS Statements');

	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByLabel('I can treat a blister and a minor cut with first aid.').check();
	await page.getByRole('button', { name: 'Choose youth' }).click();

	// Ava has the stage, so she can't be picked; Liam already has some statements
	const ava = page.locator('.pick-row', { hasText: 'Ava Nguyen' });
	await expect(ava.locator('input')).toBeDisabled();
	await page.getByRole('button', { name: 'Select everyone who needs it' }).click();
	await expect(page.getByRole('button', { name: 'Review 3 youth' })).toBeEnabled();
	await page.getByRole('button', { name: 'Review 3 youth' }).click();

	await page.getByRole('button', { name: 'Sign off 3 youth' }).click();
	await expect(page.locator('.result-row')).toHaveCount(3);
	await expect(page.locator('.result-row', { hasText: 'Noah Jones' })).toContainText(
		'Saved 2 statements'
	);
	const saves = terrain.writes.filter(
		(w) => w.request.startsWith('POST achievements') || w.request.startsWith('PUT achievements')
	);
	expect(saves).toHaveLength(3);
	await expect(page.getByRole('button', { name: 'New sign off' })).toBeVisible();
});
