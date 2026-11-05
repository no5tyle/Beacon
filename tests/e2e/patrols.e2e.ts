import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('Youth groups by name or moving up soonest, remembered on the device', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	const groupBy = page.getByRole('group', { name: 'Group by' });
	await expect(groupBy.getByRole('button', { name: 'Patrol', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await groupBy.getByRole('button', { name: 'Moving up', exact: true }).click();
	await expect(page.locator('section.patrol h3')).toHaveCount(0);
	// Oldest first, each with their patrol and when they move up
	await expect(page.locator('.youth .strong')).toHaveText([
		'Ava Nguyen',
		'Liam Smith',
		'Mia Brown',
		'Noah Jones'
	]);
	await expect(page.locator('.youth').first()).toContainText('Kookaburra');
	await expect(page.locator('.youth .move-up')).toHaveCount(4);

	await groupBy.getByRole('button', { name: 'Name', exact: true }).click();
	await navigate(page, 'insights/');
	await navigate(page, 'progress/');
	await expect(page.getByRole('button', { name: 'Name', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('the old Patrols address opens Youth by patrol', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await page.getByRole('button', { name: 'Name', exact: true }).click();
	await page.evaluate(() => {
		const home = document.querySelector('a.brand')?.getAttribute('href') ?? '/';
		const link = document.createElement('a');
		link.href = home + 'patrols/';
		document.body.appendChild(link);
		link.click();
	});
	await expect(page).toHaveURL(/\/progress\/$/);
	await expect(page.locator('section.patrol h3')).toHaveText(['Kookaburra', 'Wombat']);
});
