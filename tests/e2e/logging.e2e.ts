import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('logs Terrain requests, then downloads them', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'logging/');
	await expect(page.getByRole('button', { name: 'Stop Logging' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Download Log' })).toBeDisabled();

	await page.getByRole('button', { name: 'Start Logging' }).click();
	await navigate(page, 'progress/');
	await expect(page.locator('.youth')).toHaveCount(4);
	await page.locator('.youth').first().click();
	await expect(page.locator('.stage-detail').first()).toBeVisible();
	await navigate(page, 'logging/');
	await page.getByRole('button', { name: 'Stop Logging' }).click();

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download Log' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^1st Example_Mt Example Scouts_Dump_.*\.txt$/);
	const text = await (await file.createReadStream()).toArray();
	const log = Buffer.concat(text).toString();
	expect(log).toContain(
		'Request: GET https://achievements.terrain.scouts.com.au/members/unit-1-m0'
	);
	expect(log).not.toContain('secret');
	await expect(page.getByRole('button', { name: 'Start Logging' })).toBeEnabled();
});
