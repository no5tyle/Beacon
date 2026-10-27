import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('records the rest of a stage for one youth, then submits it for review', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await page.locator('.youth').first().click();
	// Opened from the stage in their insights, so it starts on that stage
	await page.getByRole('link', { name: 'Record statements' }).first().click();
	await expect(page.locator('h2')).toHaveText('Record OAS for Ava Nguyen');
	await expect(page.locator('#stage option:checked')).toHaveText('Bushwalking 4');
	await expect(page.getByText('4 of 7 done in Terrain')).toBeVisible();
	await expect(page.getByText('- verified by Sam Leader 01/09/2026').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();

	await page.getByRole('button', { name: 'Tick all remaining' }).click();
	await page.getByRole('button', { name: 'Save 3 to Terrain' }).click();
	await expect(page.locator('.confirm-box')).toContainText('Save to Terrain as Ava?');
	await expect(page.locator('.confirm-box')).toContainText(
		'Verified by Sam Leader (sam@example.com)'
	);
	await page.getByRole('button', { name: 'Yes, save' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Saved 3 statements to Terrain.');
	await expect(page.getByText('7 of 7 done in Terrain')).toBeVisible();

	// Saved as the youth: switched to their profile, then the record updated with every statement
	const save = terrain.writes.find((w) =>
		w.request.startsWith('PUT achievements/members/unit-1-m0')
	);
	expect(save, 'the record was updated').toBeTruthy();
	const answers = (save!.body as { answers: Record<string, unknown> }).answers;
	expect(answers['bushwalking_4_review']).toBe(true);
	expect(answers['bushwalking_4_review_verifierName']).toBe('Sam Leader');
	expect(answers['logbook_up_to_date']).toBe(true);
	expect(terrain.requests).toContain('POST members/members/unit-1-m0/assume-profiles');

	await page.getByRole('button', { name: 'Submit for review' }).click();
	await page.getByRole('button', { name: 'Yes, submit' }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		'Submitted. It now needs approval by the Unit Council in Terrain.'
	);
	await expect(page.locator('.card-head .badge')).toHaveText(
		'Submitted, waiting for Unit Council review'
	);
	expect(terrain.writes.some((w) => w.request.endsWith('/submit-on-behalf'))).toBe(true);
});

test('starts a stage a youth has no record for', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await page.locator('.youth', { hasText: 'Noah Jones' }).click();
	await page.getByRole('tab', { name: 'Records' }).click();
	await page.locator('a[href$="/record-oas/"]').click();
	await page.selectOption('#stage', { label: 'Camping 1' });
	await expect(page.getByText('0 of 7 done in Terrain')).toBeVisible();
	await expect(page.locator('.card-head .badge')).toHaveText('Not started');
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await expect(page.getByText('- to save')).toBeVisible();
	await page.getByRole('button', { name: 'Save 1 to Terrain' }).click();
	await page.getByRole('button', { name: 'Yes, save' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Saved 1 statement to Terrain.');
	const created = terrain.writes.find(
		(w) => w.request === 'POST achievements/members/unit-1-m3/achievements'
	);
	expect(created?.body).toMatchObject({
		achievement_meta: { stage: 1, stream: 'camping', branch: 'camping' },
		section: 'scout',
		answers: { camping_1_knots: true }
	});
	await expect(page.getByText('1 of 7 done in Terrain')).toBeVisible();
});

test('leaders can only tick the logbook from Stage 6', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/unit-1-m1/record-oas/');
	await page.selectOption('#stage', { label: 'Camping 6' });
	await expect(page.getByText("Adult leaders can't verify Stage 6 and above.")).toBeVisible();
	await expect(page.getByText("Terrain won't accept a submission for Stage 6")).toBeVisible();
	await expect(page.getByLabel('I can tie a reef knot and a clove hitch.')).toBeDisabled();
	await expect(page.getByLabel('My logbook is up to date.')).toBeEnabled();
});

test('saves to a record that has no last_updated, without sending one', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/unit-1-m2/record-oas/');
	await page.selectOption('#stage', { label: 'Bushcraft 1' });
	await expect(page.getByText('3 of 7 done in Terrain')).toBeVisible();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByRole('button', { name: 'Save 1 to Terrain' }).click();
	await page.getByRole('button', { name: 'Yes, save' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Saved 1 statement to Terrain.');
	const save = terrain.writes.find((w) =>
		w.request.startsWith('PUT achievements/members/unit-1-m2')
	);
	expect(save?.body).not.toHaveProperty('last_updated');
	expect(save?.body).toMatchObject({ answers: { bushcraft_1_knots: true } });
});
