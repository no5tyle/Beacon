import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('signs off statements for several youth at once', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	await expect(page.locator('h2')).toHaveText('Record OAS');

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

test('signs off statements from more than one stream together', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');

	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByRole('button', { name: /^Bushwalking/ }).click();
	await page.getByRole('button', { name: 'Stage 4', exact: true }).click();
	// The stage's statements replace the last stage's once loaded
	await expect(page.locator('.heading-row strong')).toHaveText('Bushwalking Stage 4');
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByLabel('I can treat a blister and a minor cut with first aid.').check();

	// Both stages stay picked, and each stream and stage shows how many
	await expect(page.locator('.picked-row')).toHaveText([
		/Bushwalking Stage 4 · 2 statements/,
		/Camping Stage 2 · 1 statement/
	]);
	await expect(page.getByRole('button', { name: 'Camping 1 picked' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Stage 4 2 picked' })).toBeVisible();
	await expect(page.locator('.action-bar').getByText('3 statements')).toBeVisible();
	await page.getByRole('button', { name: 'Choose youth' }).click();

	// Ava has Camping Stage 2, but Bushwalking Stage 4 is still open
	const ava = page.locator('.pick-row', { hasText: 'Ava Nguyen' });
	await expect(ava.locator('input')).toBeEnabled();
	await page.getByRole('button', { name: 'Select everyone who needs it' }).click();
	await page.getByRole('button', { name: 'Review 4 youth' }).click();
	await expect(page.locator('.review')).toContainText('Camping Stage 2');
	await expect(page.locator('.review')).toContainText('Bushwalking Stage 4');

	await page.getByRole('button', { name: 'Sign off 4 youth' }).click();
	await expect(page.getByRole('button', { name: 'New sign off' })).toBeVisible();
	await expect(page.locator('.result-row', { hasText: 'Noah Jones' })).toContainText(
		'Saved 3 statements'
	);
	const saves = terrain.writes.filter(
		(w) => w.request.startsWith('POST achievements') || w.request.startsWith('PUT achievements')
	);
	// One save for each youth and stage with something new: Ava only needed Bushwalking
	expect(saves).toHaveLength(7);
	await expect(page.locator('.result-row', { hasText: 'Ava Nguyen' })).toContainText(
		'Saved 1 statement'
	);
});

test('picked statements can be cleared by stream, or all at once', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByRole('button', { name: /^Bushwalking/ }).click();
	await page.getByRole('button', { name: 'Stage 4', exact: true }).click();
	// The stage's statements replace the last stage's once loaded
	await expect(page.locator('.heading-row strong')).toHaveText('Bushwalking Stage 4');
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();

	// Both listed before clearing: the second stream's pick moves the card's buttons as it arrives
	await expect(page.locator('.picked-row')).toHaveCount(2);
	await page.getByRole('button', { name: 'Clear Camping' }).click();
	await expect(page.locator('.picked-row')).toHaveText([/Bushwalking Stage 4/]);
	await page.getByRole('button', { name: 'Clear all' }).click();
	await expect(page.locator('.picked')).toHaveCount(0);
	await expect(page.getByLabel('I can tie a reef knot and a clove hitch.')).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Choose youth' })).toBeDisabled();
});

test('back is top left, naming the step it goes back to; the action bar only moves forward', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	await expect(page.locator('.back-link')).toHaveCount(0);
	await expect(page.locator('.record-switch')).toBeVisible();
	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByRole('button', { name: 'Choose youth' }).click();

	await expect(page.locator('.record-switch')).toHaveCount(0);
	await expect(page.locator('.action-bar button')).toHaveText([/Review/]);
	await page.locator('.pick-row', { hasText: 'Noah Jones' }).locator('input').check();
	await page.getByRole('button', { name: 'Review 1 youth' }).click();
	await page.locator('.back-link', { hasText: 'Youth' }).click();
	await expect(page.locator('.pick-row', { hasText: 'Noah Jones' }).locator('input')).toBeChecked();
	await page.locator('.back-link', { hasText: 'Statements' }).click();
	await expect(page.getByLabel('I can tie a reef knot and a clove hitch.')).toBeChecked();
	await expect(page.locator('.record-switch')).toBeVisible();
});

test('warns which verifier each stage needs when it is more than Scouting Adventure', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');

	// Camping is SA throughout: no note
	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await expect(page.locator('.verifier-levels')).toHaveCount(0);

	// Paddling needs more from Stage 2, noted at the top until a stage says which
	await page.getByRole('button', { name: 'More streams' }).click();
	await page.getByRole('button', { name: 'Paddling', exact: true }).click();
	await expect(page.locator('.verifier-levels')).toContainText(
		'Paddling from Stage 2 needs a verifier with more than Scouting Adventure (SA)'
	);
	await page.getByRole('button', { name: 'Stage 3', exact: true }).click();
	await expect(page.locator('.verifier-levels')).toContainText(
		'Verifying Paddling Stage 3 needs Trained Participant (TP) or above.'
	);
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();
	await page.getByRole('button', { name: 'Camping', exact: true }).click();
	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.getByLabel('I can tie a reef knot and a clove hitch.').check();

	await page.getByRole('button', { name: 'Choose youth' }).click();
	await page.locator('.pick-row', { hasText: 'Noah Jones' }).locator('input').check();
	await page.getByRole('button', { name: /^Review/ }).click();
	// Before saving, each stage that needs more than SA, and what (Camping isn't listed)
	const warning = page.locator('.verifier-levels');
	await expect(warning).toContainText('These need more than Scouting Adventure (SA) to verify:');
	await expect(warning.locator('li')).toHaveText([
		'Paddling Stage 2: Safe Participant (SP)',
		'Paddling Stage 3: Trained Participant (TP)'
	]);
});
