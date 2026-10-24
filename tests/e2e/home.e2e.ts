import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

const twoUnits = [
	{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' },
	{ id: 'unit-2', name: 'Mt Example Cubs', section: 'cub' }
];

test('a leader with one unit has it chosen straight away, and no unit picker', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await expect(page.locator('#group')).toHaveValue('group-1');
	await expect(page.locator('#chosenUnit')).toHaveCount(0);
	// The unit's progress starts loading in the background
	await expect
		.poll(() => terrain.requests.filter((r) => r.includes('type=milestone')).length)
		.toBe(4);
});

test('a leader with more than one unit picks one, and it is remembered', async ({ page }) => {
	const terrain = await fakeTerrain(page, { units: twoUnits });
	await logIn(page);
	await expect(page.locator('#chosenUnit')).toHaveValue('');
	await expect(page.locator('.hint')).toHaveText(
		'Choose the unit to work with. Every page uses it.'
	);
	expect(
		terrain.requests.some((r) => r.includes('/members')),
		'nothing loads until a unit is chosen'
	).toBe(false);

	await page.selectOption('#chosenUnit', 'unit-2');
	await expect
		.poll(() => terrain.requests.some((r) => r.includes('units/unit-2/members')))
		.toBe(true);

	await navigate(page, 'logout/');
	await expect(page).toHaveURL(/\/login\/$/);
	await logIn(page);
	await expect(page.locator('#chosenUnit')).toHaveValue('unit-2');
});

test('a youth member sees only their own pages', async ({ page, isMobile }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await expect(page.locator('h2')).toHaveText('Welcome Ava Nguyen');
	const links = isMobile ? page.locator('.tab-bar .tab') : page.locator('.side-link');
	await expect(links.filter({ hasText: 'Insights' })).toHaveCount(0);
	await expect(links.filter({ hasText: /^Record/ })).toHaveCount(0);
});
