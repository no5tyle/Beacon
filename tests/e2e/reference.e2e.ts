import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('the Reference works signed out, and filters and expands statements', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('oas-reference/');
	await expect(page.locator('h2')).toHaveText('OAS reference');
	// Core streams, 9 stages each, 6 statements a stage
	await expect(page.getByText('162 statements')).toBeVisible();

	await page.getByRole('button', { name: 'Stage 2', exact: true }).click();
	await page.selectOption('#part', 'Do');
	await expect(page.getByText('9 statements')).toBeVisible();
	await expect(page).toHaveURL(/stage=2&part=Do/);

	await page.locator('#search').fill('compass');
	await expect(page.getByText('3 statements')).toBeVisible();
	const statement = page.locator('.statement').first();
	await statement.locator('.statement-text').click();
	await expect(statement.locator('.statement-detail')).toHaveText(
		'Show the youth can orient the map and take a bearing.'
	);
});

test('starred statements are kept, and listed on their own', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('oas-reference/?stream=camping&stage=1');
	await expect(page.getByText('6 statements')).toBeVisible();
	await page.locator('.statement').first().getByRole('button', { name: 'Star' }).click();
	await page.getByRole('button', { name: '★ Starred (1)' }).click();
	await expect(page.locator('.starred-banner')).toBeVisible();
	await expect(page.locator('.statement')).toHaveCount(1);

	await page.reload();
	await expect(page.getByRole('button', { name: '★ Starred (1)' })).toBeVisible();
	await expect(page.locator('.statement')).toHaveCount(1);
});

test('a shared statement opens on its stage, expanded', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('reference/?s=bushwalking%2F3%3Abushwalking_3_map');
	await expect(page.locator('.app-title')).toHaveText('Beacon Reference');
	await expect(page.locator('.tab-bar, .sidebar')).toHaveCount(0);
	const open = page.locator('.statement.open');
	await expect(open).toHaveCount(1);
	await expect(open).toContainText('I can use a map and compass to find my way.');
	await expect(page.locator('.stage-title')).toHaveText('Bushwalking Stage 3');
});

test('the Reference app keeps its filters behind the menu', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('reference/');
	await expect(page.locator('#stream')).toHaveCount(0);
	await page.getByRole('button', { name: 'Filters' }).click();
	await page.selectOption('#where', 'UnitNight');
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.locator('.app-filter-count')).toHaveText('1');
	await expect(page.locator('.statement .badge-success').first()).toHaveText('unit night');
});

test("signed in, each statement shows how many of the unit's youth have it", async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas-reference/?stream=bushwalking&stage=4');
	// Counted when the stage comes into view
	await page.locator('.stage-group').first().scrollIntoViewIfNeeded();
	await expect(page.locator('.count-key')).toHaveText(
		/Of the 4 youth in Mt Example Scouts: ✓ have it · ○ don't yet/
	);
	const statement = (text: string) =>
		page.locator('.statement', { hasText: text }).locator('.unit-count');
	// Ava has Bushwalking 4 started, with all but these two ticked
	await expect(statement('I can use a map and compass')).toHaveText('✓ 1 · ○ 3');
	await expect(statement('I can tie a reef knot')).toHaveText('✓ 0 · ○ 4');
	await expect(statement('I can tie a reef knot')).toHaveAccessibleName(
		"0 youth have this, 4 don't yet"
	);
});

test("a stage's counts are asked of Terrain once", async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	// A stage Insights doesn't look at, so its requests are only the Reference's
	await navigate(page, 'oas-reference/?stream=bushwalking&stage=9');
	await page.locator('.stage-group').first().scrollIntoViewIfNeeded();
	await expect(page.locator('.count-key')).toBeVisible();
	await page
		.locator('.stage-group')
		.first()
		.evaluate((el) => el.scrollIntoView());
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.locator('.stage-group').first().scrollIntoViewIfNeeded();
	expect(
		terrain.requests.filter(
			(r) =>
				r.includes('units/unit-1/achievements') &&
				r.includes('stream=bushwalking&branch=bushwalking&stage=9')
		)
	).toHaveLength(1);
});

test('signed out, the Reference shows no counts', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('oas-reference/?stream=bushwalking&stage=4');
	await expect(page.locator('.statement').first()).toBeVisible();
	await expect(page.locator('.unit-count, .count-key')).toHaveCount(0);
});

test('printed while signed in, every stage has its counts', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas-reference/?stream=camping');
	await expect(page.locator('.stage-group').first()).toBeVisible();
	const stages = await page.locator('.stage-group').count();
	await page.evaluate(() => {
		(window as unknown as { printed: number }).printed = 0;
		window.print = () => (window as unknown as { printed: number }).printed++;
	});
	await page.getByRole('button', { name: 'Print', exact: true }).first().click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
		.toBe(1);
	// Every stage was counted before the print, not just those scrolled into view
	await expect(page.locator('.count-key')).toHaveCount(stages);
	expect(
		new Set(
			terrain.requests.filter(
				(r) => r.includes('units/unit-1/achievements') && r.includes('stream=camping')
			)
		).size
	).toBe(stages);
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('.unit-count').first()).toBeVisible();
});

test('printed with names, each statement lists the youth without it', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas-reference/?stream=bushwalking&stage=4');
	await page.evaluate(() => (window.print = () => undefined));
	await page.getByLabel('Print the names of youth without each statement').check();
	await page.getByRole('button', { name: 'Print', exact: true }).first().click();
	await expect(page.locator('.count-key')).toHaveCount(1);
	// Only on paper
	const names = (text: string) =>
		page.locator('.statement', { hasText: text }).locator('.lacking-names');
	await expect(names('I can use a map and compass')).toBeHidden();
	await page.emulateMedia({ media: 'print' });
	await expect(names('I can use a map and compass')).toHaveText(
		'Not yet: Liam Smith, Mia Brown, Noah Jones'
	);
	await expect(names('I can tie a reef knot')).toHaveText(
		'Not yet: Ava Nguyen, Liam Smith, Mia Brown, Noah Jones'
	);
	// Remembered on the device; no names are kept
	expect(await page.evaluate(() => localStorage.getItem('beacon-reference-print-names'))).toBe(
		'true'
	);
});

test('printed, just the statements: no filters, with longer explanations if asked', async ({
	page
}) => {
	await fakeTerrain(page);
	await page.goto('oas-reference/?stream=bushwalking&stage=4');
	await expect(page.locator('.statement').first()).toBeVisible();
	const explanation = page
		.locator('.statement', { hasText: 'I can use a map and compass' })
		.locator('.statement-detail');
	await expect(explanation).toHaveCount(0);
	await page.getByLabel('Print the longer explanations').check();
	// Kept for paper, not shown on screen
	await expect(explanation).toBeHidden();
	await page.emulateMedia({ media: 'print' });
	await expect(explanation).toHaveText('Show the youth can orient the map and take a bearing.');
	await expect(page.getByLabel('Search')).toBeHidden();
	await expect(page.locator('#stream')).toBeHidden();
	await expect(page.getByRole('heading', { name: 'OAS reference' })).toBeVisible();
});
