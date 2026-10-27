import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('progress reports for the unit, with the parts the leader ticks', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await page.getByRole('link', { name: 'Reports' }).click();
	await expect(page.locator('h2').first()).toHaveText('Progress reports');

	// Everyone, a report each
	const reports = page.locator('.report');
	await expect(reports).toHaveCount(4);
	const ava = reports.filter({ hasText: 'Ava Nguyen' });
	await expect(ava.locator('.report-kicker')).toHaveText('Mt Example Scouts · Progress report');
	await expect(ava).toContainText('Australian Scout Award · 48%');
	await expect(ava.locator('.stage', { hasText: 'Stage 4' })).toContainText('In progress · 4 of 6');
	// Statements only when asked for
	await expect(ava.locator('.statements')).toHaveCount(0);
	await page.getByLabel('Statements still to do').check();
	await expect(ava.locator('.stage', { hasText: 'Stage 4' }).locator('.statements li')).toHaveText([
		/I can tie a reef knot and a clove hitch\./,
		/I can talk about what went well/
	]);
	await page.getByLabel('Achieved "I can" statements').check();
	await expect(ava.locator('.stage', { hasText: 'Stage 4' }).locator('.statements li')).toHaveCount(
		6
	);

	// Parts can be left out, and the choice is remembered
	await page.getByLabel('Special interest areas').uncheck();
	await expect(ava.getByRole('heading', { name: 'Special interest areas' })).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('beacon-report-options'))).toContain(
		'"sia":false'
	);

	// Fewer youth
	await page.locator('.check', { hasText: 'Liam Smith' }).getByRole('checkbox').uncheck();
	await expect(reports).toHaveCount(3);
});

test("a youth's details open their own report, and the note prints but isn't kept", async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/unit-1-m0/');
	await page.getByRole('button', { name: 'Options' }).click();
	await page.getByRole('link', { name: 'Progress report to print' }).click();
	await expect(page.locator('.report')).toHaveCount(1);
	await expect(page.locator('.report-name')).toHaveText('Ava Nguyen');

	await page.locator('.report textarea').fill('A great term on the hikes.');
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('.note-print')).toHaveText('A great term on the hikes.');
	await expect(page.locator('.report textarea')).toBeHidden();
	expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))).not.toContain(
		'great term'
	);
});
