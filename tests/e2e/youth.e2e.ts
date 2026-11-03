// The youth experience: in a unit they're youth in, a member sees Record for SIAs, their own Progress,
// Approvals if on its Unit Council, and Reference and Logout under the menu
import { expect, test, type Page } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

/** The main pages: the phone's tab bar (without More), or the top of the sidebar */
const mainLinks = (page: Page, isMobile: boolean) =>
	isMobile
		? page.locator('.tab-bar .tab').filter({ hasNotText: 'More' })
		: page.locator('.sidebar nav .side-link');

/** What's under the menu: More on phones; on desktop, the bottom of the sidebar */
async function menuTitles(page: Page, isMobile: boolean): Promise<string[]> {
	if (!isMobile) return [];
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.locator('.tab-bar button', { hasText: 'More' }).click();
	// The menu opens before its items can be read
	await expect(page.locator('.more-item', { hasText: 'Logout' })).toBeVisible();
	const titles = await page.locator('.more-item').allInnerTexts();
	await page.keyboard.press('Escape');
	return titles.map((t) => t.trim());
}

test('a youth opens at their own progress, with Record, Progress and Reference, and Logout in the menu', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await expect(page).toHaveURL(/\/progress\/unit-1-m0\/$/);
	await expect(page.locator('h2')).toHaveText('Ava Nguyen');
	// Their own progress only: no list to go back to
	await expect(page.locator('.back-link')).toHaveCount(0);

	// Off the Unit Council, Reference is in the bar and only Logout is under the menu
	if (isMobile) {
		await expect(mainLinks(page, isMobile)).toHaveText(['Record', 'Progress', 'Reference']);
		expect(await menuTitles(page, isMobile)).toEqual(['Logout']);
	} else {
		await expect(mainLinks(page, isMobile)).toHaveText([
			'Record',
			'Progress',
			'Reference',
			'Logout'
		]);
	}

	// Record opens their own OAS, with a switch to SIAs
	await mainLinks(page, isMobile).filter({ hasText: 'Record' }).click();
	await expect(page).toHaveURL(/\/progress\/unit-1-m0\/record-oas\/$/);
	await page.getByRole('navigation', { name: 'Record' }).getByRole('link', { name: 'SIA' }).click();
	await expect(page.locator('h2')).toHaveText('Plan an SIA');
	await expect(page.locator('.construction')).toContainText('enter them in Terrain');
});

test("a youth can't open the leaders' pages or anyone else's progress", async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	for (const path of [
		'insights/',
		'patrols/',
		'approvals/',
		'oas/sign-off/',
		'record/activity/',
		'progress/',
		'progress/unit-1-m1/'
	]) {
		await navigate(page, 'record/sia-plan/');
		await page.evaluate((path) => {
			const home = document.querySelector('a.brand')?.getAttribute('href') ?? '/';
			const link = document.createElement('a');
			link.href = home + path;
			document.body.appendChild(link);
			link.click();
			link.remove();
		}, path);
		await expect(page).toHaveURL(/\/progress\/unit-1-m0\/$/);
	}
});

test('a youth on the Unit Council has Approvals, with Approve and Award but not Submit', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page, { youth: true, councilIn: ['unit-1'] });
	await logIn(page);
	// Settled on their own progress, so the menu isn't closed by moving there
	await expect(page).toHaveURL(/\/progress\/unit-1-m0\/$/);
	await expect(mainLinks(page, isMobile).filter({ hasText: 'Approvals' })).toHaveCount(1);
	// Approvals takes Reference's place in the bar, which goes under the menu
	if (isMobile) expect(await menuTitles(page, isMobile)).toEqual(['Reference', 'Logout']);
	await mainLinks(page, isMobile).filter({ hasText: 'Approvals' }).click();
	await expect(page).toHaveURL(/\/approvals\/$/);
	await expect(page.getByRole('tab')).toHaveText([/^Approve/, /^Award/]);
	await expect(
		page
			.getByRole('region', { name: /^To approve/ })
			.locator('.approval-card')
			.first()
	).toBeVisible();
	await page.getByRole('tab', { name: /^Award/ }).click();
	await expect(page.getByRole('region', { name: 'Ready to award' })).toBeVisible();
	await expect(page.locator('main')).not.toContainText('Checking for milestones and stages');
});

test('a youth who leads another unit sees each unit as they are in it, with the unit picker', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page, {
		units: [
			{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' },
			{ id: 'unit-2', name: 'Mt Example Cubs', section: 'cub' }
		],
		youthIn: ['unit-1']
	});
	await logIn(page);
	const picker = async () => {
		if (!isMobile) return page.locator('#side-unit');
		if (!(await page.locator('#menu-unit').isVisible())) {
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.locator('.tab-bar button', { hasText: 'More' }).click();
		}
		return page.locator('#menu-unit');
	};

	// Closes the More menu if it's still open: moving to another page closes it already
	const closeMenu = async () => {
		if (isMobile && (await page.locator('.more-backdrop').isVisible()))
			await page.keyboard.press('Escape');
	};

	// A leader in the Cubs
	await (await picker()).selectOption('unit-2');
	await closeMenu();
	await navigate(page, 'insights/');
	await expect(mainLinks(page, isMobile).filter({ hasText: 'Insights' })).toHaveCount(1);

	// Youth in the Scouts: off Insights to their own progress, with the youth's pages
	await (await picker()).selectOption('unit-1');
	await expect(page).toHaveURL(/\/progress\/unit-1-m0\/$/);
	await closeMenu();
	await expect(mainLinks(page, isMobile).filter({ hasText: 'Insights' })).toHaveCount(0);
	await expect(mainLinks(page, isMobile).first()).toHaveText('Record');
	await expect(page.locator('h2')).toHaveText('Ava Nguyen');

	// And back to the Cubs, where they lead again
	await (await picker()).selectOption('unit-2');
	await closeMenu();
	await expect(mainLinks(page, isMobile).filter({ hasText: 'Insights' })).toHaveCount(1);
});
