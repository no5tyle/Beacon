import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('Record moves between OAS, Activity and SIA plan, staying the current tab', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	const record = page.getByRole('navigation', { name: 'Record' });
	await expect(record.getByRole('link')).toHaveText(['OAS', 'Activity', 'SIA plan']);
	await record.getByRole('link', { name: 'Activity' }).click();
	await expect(page.locator('h2')).toHaveText('Log activity');
	await expect(record.getByRole('link', { name: 'Activity' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const current = isMobile
		? page.locator('.tab-bar .tab.active')
		: page.locator('.side-link.active');
	await expect(current).toHaveText('Record');
	await record.getByRole('link', { name: 'SIA plan' }).click();
	await expect(page.locator('h2')).toHaveText('SIA plan');
	await expect(current).toHaveText('Record');
});

test('logs a camp: details, who came and their roles, logbook, then a review that sends nothing', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	const next = page.getByRole('button', { name: /^Next/ });

	await page.getByRole('button', { name: 'Camp', exact: true }).click();
	await expect(page.locator('.steps li')).toHaveText(['Activity', 'Who came', 'Logbook', 'Review']);
	await expect(next).toBeDisabled();
	await page.getByLabel('Title').fill('Spring camp');
	await page.getByLabel('Starts').fill('2026-10-23');
	await page.getByLabel('Ends').fill('2026-10-25');
	await page.getByRole('button', { name: 'Outdoors' }).click();
	await next.click();

	await expect(next).toBeDisabled();
	await page.getByRole('button', { name: 'Everyone' }).click();
	await expect(page.locator('.attendee.came')).toHaveCount(4);
	const ava = page.locator('.attendee', { hasText: 'Ava Nguyen' });
	await ava.getByRole('button', { name: 'Leader' }).click();
	await page.locator('.attendee', { hasText: 'Noah Jones' }).getByRole('checkbox').uncheck();
	await next.click();

	// Two nights from the dates, the same for everyone unless changed
	await expect(page.getByLabel('Nights camped')).toHaveValue('2');
	await page.getByLabel('Kilometres hiked').fill('6');
	await page.getByText('Different for some youth').click();
	await page.getByLabel("Liam Smith's nights").fill('1');
	await page.getByLabel("Liam Smith's nights").blur();
	await next.click();

	const review = page.locator('.review');
	await expect(review.locator('h3')).toHaveText('Spring camp');
	await expect(review).toContainText('2026-10-23 18:00 to 2026-10-25 12:00');
	await expect(review).toContainText('Outdoors');
	await expect(review).toContainText('2 participants, 1 leader');
	await expect(review).toContainText('2 nights, 6 km each, different for 1');
	await expect(review.locator('li')).toHaveText(['Ava Nguyen (Leader)', 'Liam Smith', 'Mia Brown']);
	await expect(page.getByRole('button', { name: 'Save to Terrain' })).toBeDisabled();
	expect(terrain.writes).toEqual([]);
});

test('a unit night has no logbook step', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	await expect(page.locator('.steps li')).toHaveText(['Activity', 'Who came', 'Review']);
	await page.getByLabel('Title').fill('Knots night');
	await page.getByRole('button', { name: 'Creative' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await expect(page.locator('.review')).toContainText('1 participant');
	await expect(page.locator('.review')).not.toContainText('Logbook');
});

test('enters an SIA plan: youth, area and project, then a review that sends nothing', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/sia-plan/');
	const next = page.getByRole('button', { name: /^Next/ });
	await expect(next).toBeDisabled();
	await page.getByLabel('Mia Brown').check();
	await next.click();

	await expect(next).toBeDisabled();
	await page.getByRole('button', { name: 'Arts & Literature' }).click();
	await page.getByLabel('Project name').fill('Puppet show');
	await next.click();

	const review = page.locator('.review');
	await expect(review.locator('h3')).toHaveText('Puppet show');
	await expect(review).toContainText('Mia Brown');
	await expect(review).toContainText('Arts & Literature');
	await expect(page.getByRole('button', { name: 'Save to Terrain' })).toBeDisabled();
	expect(terrain.writes).toEqual([]);
});

test('youth members can’t log activities or plans', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	for (const path of ['record/activity/', 'record/sia-plan/']) {
		await navigate(page, path);
		await expect(page).not.toHaveURL(/\/record\//);
	}
});
