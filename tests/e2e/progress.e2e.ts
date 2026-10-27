import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('Progress lists the youth, and each opens their details', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await expect(page.locator('h2')).toHaveText('Progress (Mt Example Scouts)');
	const cards = page.locator('.youth');
	await expect(cards).toHaveCount(4);
	await expect(cards.locator('.strong')).toHaveText([
		'Ava Nguyen',
		'Liam Smith',
		'Mia Brown',
		'Noah Jones'
	]);
	await expect(cards.first()).toContainText(/Member Number\s*100/);
	await expect(cards.first()).toContainText(/Patrol\s*Kookaburra/);
	await expect(cards.first()).toContainText(/Role\s*PL/);
	await expect(cards.first()).toContainText(/Unit Council\s*Yes/);

	await cards.first().click();
	await expect(page.locator('h2')).toHaveText('Ava Nguyen');
	await expect(page).toHaveURL(/\/progress\/unit-1-m0\/$/);
});

test("each youth's award progress shows once the unit's progress has loaded", async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	// Insights loads the unit's progress; the list then has it without asking Terrain again
	await navigate(page, 'insights/');
	await expect(page.locator('.stat-tile').first()).toContainText('Youth analysed 4');
	await navigate(page, 'progress/');
	const ava = page.locator('.youth', { hasText: 'Ava Nguyen' });
	await expect(ava.locator('.award')).toHaveText('Australian Scout Award 48%');
	// The same as on her details
	await ava.click();
	await expect(page.locator('.summary-tile').first()).toContainText('48%');
});

test('youth details: who they are, next steps, awards and records', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/');
	await page.locator('.youth').first().click();

	await expect(page.locator('.person-facts')).toContainText(
		'Kookaburra · PL · Unit Council · No. 100'
	);
	await expect(page.locator('.summary-tile').nth(1)).toContainText('Milestone 2');
	await expect(page.locator('.summary-tile').nth(3)).toContainText(/Nights camped\s*9/);
	await expect(page.locator('.summary-tile').nth(3)).toContainText('42 km hiked');

	// Next steps: what's outstanding, each stage with its own way to record it
	await expect(page.getByRole('tab', { name: 'Next steps' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page.locator('.stage-detail').first()).toContainText('Bushwalking 4');
	await expect(page.locator('.stage-detail').first()).toContainText('4/7 done');
	await expect(page.getByRole('heading', { name: "Themes in what's missing" })).toBeVisible();

	// Awards: each milestone once, its activities folded away, and the award as one checklist
	await page.getByRole('tab', { name: 'Awards' }).click();
	const milestones = page.locator('.milestone');
	await expect(milestones.first()).toContainText(/Milestone 1\s*Awarded \d\d\/\d\d\/\d\d/);
	await expect(milestones.nth(1)).toContainText('In Progress');
	await expect(milestones.nth(1).locator('.need-row')).toHaveCount(5);
	await milestones.nth(1).getByText('Activities (8)').click();
	await expect(milestones.nth(1)).toContainText('Cooking night 1');
	await expect(milestones.nth(1)).toContainText('Personal Growth');
	const checklist = page.locator('.checklist');
	await expect(
		checklist.locator('.task.done', { hasText: 'Personal development course' })
	).toContainText(/\d\d\/\d\d\/\d\d/);
	await expect(
		checklist.locator('.task:not(.done)', { hasText: 'Adventurous Journey' })
	).toHaveCount(1);

	// Records: OAS stages as a grid, special interest areas and the logbook
	await page.getByRole('tab', { name: 'Records' }).click();
	await expect(
		page.getByRole('img', { name: /^Bushwalking Stage 1, Awarded, \d\d\/\d\d\/\d\d$/ })
	).toBeVisible();
	await expect(page.getByRole('img', { name: 'Bushwalking Stage 4, Started' })).toBeVisible();
	// Non-core streams show once asked for
	await expect(page.locator('.oas-stream', { hasText: 'Cycling' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Options' }).click();
	await page.getByLabel('Include non-core OAS').check();
	await expect(page.locator('.oas-stream', { hasText: 'Cycling' })).toHaveCount(1);
	await expect(page.locator('.sia')).toHaveCount(2);
	await expect(page.locator('.stats')).toContainText(/Kilometres hiked\s*42/);

	await page.getByRole('link', { name: 'Progress', exact: true }).first().click();
	await expect(page.locator('h2')).toHaveText('Progress (Mt Example Scouts)');
});

test('milestones just say Completed once all three are awarded', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/unit-1-m3/');
	await expect(page.locator('.summary-tile').nth(1)).toHaveText(/Milestones\s*Completed/);
	await page.getByRole('tab', { name: 'Awards' }).click();
	const milestones = page.locator('.tab-panel.shown section').first();
	await expect(milestones).toHaveText(/^\s*Completed\s*$/);
	await expect(page.locator('.milestone')).toHaveCount(0);
});

test('a youth member sees their own progress, without recording', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await navigate(page, 'progress/');
	await expect(page.locator('.youth')).toHaveCount(1);
	await page.locator('.youth').click();
	await expect(page.locator('h2')).toHaveText('Ava Nguyen');
	await expect(page.locator('.stage-detail').first()).toBeVisible();
	await expect(page.locator('a[href$="/record-oas/"]')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Record statements' })).toHaveCount(0);
});
