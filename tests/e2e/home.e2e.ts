import { expect, test, type Page } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

const twoUnits = [
	{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' },
	{ id: 'unit-2', name: 'Mt Example Cubs', section: 'cub' }
];

/** The unit picker kept with the navigation: under More on phones, in the sidebar on desktop */
async function navUnit(page: Page, isMobile: boolean) {
	if (!isMobile) return page.locator('#side-unit');
	await page.locator('.tab-bar button', { hasText: 'More' }).click();
	return page.locator('#menu-unit');
}

test('a leader opens at Insights, with one unit chosen straight away and no picker', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await expect(page).toHaveURL(/\/insights\/$/);
	await expect(page.locator('.unit-picker')).toHaveCount(0);
	// The unit's progress starts loading in the background
	await expect
		.poll(() => terrain.requests.filter((r) => r.includes('type=milestone')).length)
		.toBe(4);
});

test('a leader with more than one unit picks one on the page, and it is remembered', async ({
	page,
	isMobile
}) => {
	const terrain = await fakeTerrain(page, { units: twoUnits });
	await logIn(page);
	await expect(page).toHaveURL(/\/insights\/$/);
	await expect(page.locator('.choose-unit')).toContainText('Choose a unit first');
	await expect(page.locator('#page-unit')).toHaveValue('');
	expect(
		terrain.requests.some((r) => r.includes('/members')),
		'nothing loads until a unit is chosen'
	).toBe(false);

	await page.selectOption('#page-unit', 'unit-2');
	await expect
		.poll(() => terrain.requests.some((r) => r.includes('units/unit-2/members')))
		.toBe(true);
	await expect(page.locator('.choose-unit')).toHaveCount(0);
	await expect(await navUnit(page, isMobile)).toHaveValue('unit-2');

	await navigate(page, 'logout/');
	await expect(page).toHaveURL(/\/login\/$/);
	await logIn(page);
	await expect(page).toHaveURL(/\/insights\/$/);
	await expect(page.locator('.choose-unit')).toHaveCount(0);
	await expect(await navUnit(page, isMobile)).toHaveValue('unit-2');
});

test('the unit can be changed from the navigation on any page', async ({ page, isMobile }) => {
	const terrain = await fakeTerrain(page, { units: twoUnits });
	await logIn(page);
	await page.selectOption('#page-unit', 'unit-1');
	await navigate(page, 'progress/');
	await (await navUnit(page, isMobile)).selectOption('unit-2');
	await expect
		.poll(() => terrain.requests.some((r) => r.includes('units/unit-2/members')))
		.toBe(true);
	await expect(page.locator('main h2')).toHaveText('Progress (Mt Example Cubs)');
});

test('Info says what each page is for and who is signed in', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'info/');
	await expect(page.locator('h2')).toHaveText('About Beacon');
	await expect(page.locator('main')).toContainText('Signed in as Sam Leader');
	await expect(page.locator('main')).toContainText('Use Insights to see');
});

test('a youth member opens at their Progress and sees only their own pages', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await expect(page).toHaveURL(/\/progress\//);
	const links = isMobile ? page.locator('.tab-bar .tab') : page.locator('.side-link');
	await expect(links.filter({ hasText: 'Insights' })).toHaveCount(0);
	await expect(links.filter({ hasText: /^Record/ })).toHaveCount(0);
	await navigate(page, 'info/');
	await expect(page.locator('main')).toContainText('Signed in as Ava Nguyen');
});
