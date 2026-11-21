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
	// How far through each award item, without the introductions everyone has done
	const award = ava.locator('.checklist');
	await expect(award.locator('li', { hasText: 'OAS stage progressions' })).toContainText(
		'9 of 10 done'
	);
	await expect(award.locator('li', { hasText: 'SIA projects' })).toContainText(
		'1 of 6 completed, 1 in progress, 1 of 3 areas'
	);
	await expect(award.locator('li', { hasText: 'Milestone 3' })).toContainText('1 of 3 done');
	await expect(award).not.toContainText('Introduction to');
	// The front page sums up each OAS stream
	await expect(ava.locator('table.oas tr', { hasText: 'Bushwalking' })).toHaveText(
		/Bushwalking\s*Stage 3 \d\d\/\d\d\/\d\d\s*Stage 4\s*4 of 6/
	);
	// Statements only when asked for, on a page of their own
	await expect(ava.locator('.statements-page')).toHaveCount(0);
	await page.getByLabel('"I" statements still to do').check();
	const statements = ava.locator('.statements-page');
	await expect(statements.locator('.statements-head')).toContainText(
		'Ava Nguyen · Outdoor Adventure Skills'
	);
	const bushwalking = statements.locator('.stream', { hasText: 'Bushwalking' });
	await expect(bushwalking.locator('.stage', { hasText: 'Stage 4' }).locator('li')).toHaveText([
		/I can tie a reef knot and a clove hitch\./,
		/I can talk about what went well/
	]);
	// And every statement of the core stages the Australian Scout Award (Stage 5) still needs, though
	// not started: above the highest completed in each stream
	await expect(bushwalking.locator('.stage-line')).toHaveText([
		/Stage 4\s*In progress/,
		/Stage 5\s*Not started, needed for the award/
	]);
	await expect(bushwalking.locator('.stage', { hasText: 'Stage 5' }).locator('li')).toHaveCount(6);
	await expect(
		statements.locator('.stream', { hasText: 'Bushcraft' }).locator('.stage-line')
	).toHaveText([/Stage 3/, /Stage 4/, /Stage 5/]);
	await expect(
		statements.locator('.stream', { hasText: 'Camping' }).locator('.stage-line')
	).toHaveText([/Stage 4/, /Stage 5/]);
	// The front page still sums up only the stages they've a record for
	await expect(ava.locator('table.oas tr', { hasText: 'Bushcraft' })).toHaveText(
		/Bushcraft\s*Stage 2 \d\d\/\d\d\/\d\d\s*–/
	);
	await page.getByLabel('Achieved "I" statements').check();
	await expect(bushwalking.locator('.stage', { hasText: 'Stage 4' }).locator('li')).toHaveCount(6);
	// Printed, the statements start a new page and run on over as many as they need
	await page.emulateMedia({ media: 'print' });
	await expect(statements).toHaveCSS('break-before', 'page');
	await expect(statements.locator('.stream').first()).toHaveCSS('break-inside', 'auto');
	await page.emulateMedia({ media: 'screen' });

	// Parts can be left out, and the choice is remembered
	await page.getByLabel('Special interest areas').uncheck();
	await expect(ava.getByRole('heading', { name: 'Special interest areas' })).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('beacon-report-options'))).toContain(
		'"sia":false'
	);

	// In Nunito Sans, Scouts Australia's typeface, served with Beacon
	await expect(ava.locator('.report-name')).toHaveCSS('font-family', /^"Nunito Sans Variable"/);
	expect(
		await page.evaluate(async () => {
			await document.fonts.ready;
			return document.fonts.check('700 1em "Nunito Sans Variable"');
		})
	).toBe(true);

	// In colour by default: the Scouts section's green, under a navy band; or in black and white
	await expect(ava).toHaveClass(/\bcolour\b/);
	await expect(ava.locator('.report-head')).toHaveCSS('background-color', 'rgb(40, 38, 92)');
	await expect(ava.locator('.report-head')).toHaveCSS('border-bottom-color', 'rgb(12, 174, 75)');
	await page.getByRole('radio', { name: 'Black and white' }).check();
	await expect(ava).not.toHaveClass(/\bcolour\b/);
	await expect(ava.locator('.report-head')).toHaveCSS('border-bottom-color', 'rgb(0, 0, 0)');
	await expect(ava.getByRole('heading', { name: 'Milestones' })).toHaveCSS('color', 'rgb(0, 0, 0)');
	expect(await page.evaluate(() => localStorage.getItem('beacon-report-options'))).toContain(
		'"colour":false'
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

test('printed double-sided, each report starts on a new sheet', async ({ page }) => {
	const pages = (pdf: Buffer) =>
		(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
	const print = async () => {
		await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
		return pages(await page.pdf({ format: 'A4', preferCSSPageSize: true }));
	};
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/report/');
	await expect(page.locator('.report')).toHaveCount(4);
	await expect(page.locator('.report table.oas').first()).toBeVisible();
	// Each report takes 3 pages: the front page and the statements, with every core stage the award
	// still needs, over two
	await page.getByLabel('Achieved "I" statements').check();
	await page.getByLabel('"I" statements still to do').check();
	await page.getByLabel('Non-core streams').check();
	// Non-core streams load the reports again
	await expect(page.getByText('Preparing reports')).toHaveCount(0);
	await expect(page.locator('.statements-page')).toHaveCount(4);
	expect(await print()).toBe(12);

	// A blank page after each but the last, Noah's, as nothing follows it
	await page.getByLabel('Double-sided: each report starts on a new sheet').check();
	// In place before printing starts, for browsers that don't say they're about to print
	await expect(page.locator('.blank-page')).toHaveCount(3);
	expect(pages(await page.pdf({ format: 'A4', preferCSSPageSize: true }))).toBe(15);
	expect(await print()).toBe(15);
	await expect(page.locator('.blank-page')).toHaveCount(3);
	await expect(page.locator('.report').first().locator('+ .blank-page')).toHaveCount(1);

	// With only the achieved statements, Ava's report takes 3 pages, Liam's and Mia's 2 and Noah's 1: a
	// blank page after Ava's alone
	await page.getByLabel('"I" statements still to do').uncheck();
	await expect(page.locator('.blank-page')).toHaveCount(1);
	await expect(page.locator('.report').first().locator('+ .blank-page')).toHaveCount(1);
	expect(await print()).toBe(9);

	// Just the front pages: a blank after each but the last
	await page.getByLabel('Outdoor Adventure Skills').uncheck();
	await expect(page.locator('.blank-page')).toHaveCount(3);
	expect(await print()).toBe(7);

	// Single-sided again, none
	await page.getByLabel('Double-sided: each report starts on a new sheet').uncheck();
	await expect(page.locator('.blank-page')).toHaveCount(0);
	expect(await print()).toBe(4);
});

test('the front page fits on one page when a phone lays the print out narrower', async ({
	page
}) => {
	const pages = (pdf: Buffer) =>
		(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/report/?ids=unit-1-m0');
	await expect(page.locator('.report table.oas')).toBeVisible();
	expect(pages(await page.pdf({ format: 'A4' }))).toBe(1);
	// A4 as Safari on an iPhone lays it out, a CSS pixel to a point: about 530px across
	expect(pages(await page.pdf({ width: '163mm', height: '230mm' }))).toBe(1);
	// Narrower still
	expect(pages(await page.pdf({ width: '125mm', height: '177mm' }))).toBe(1);
});

test('the option cards side by side line up, the same height', async ({ page, isMobile }) => {
	test.skip(isMobile, 'side by side on wider screens only');
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/report/');
	const cards = page.locator('.choices > .card');
	await expect(cards).toHaveCount(2);
	const [a, b] = await cards.evaluateAll((els) =>
		els.map((e) => {
			const r = e.getBoundingClientRect();
			return { top: Math.round(r.top), height: Math.round(r.height) };
		})
	);
	expect(b).toEqual(a);
});

test('each milestone a youth is working on shows what it still needs', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/report/');
	// Liam is logging towards Milestone 2 before Milestone 1 is awarded
	const liam = page.locator('.report').filter({ hasText: 'Liam Smith' });
	const milestones = liam.locator('.part', {
		has: page.getByRole('heading', { name: 'Milestones' })
	});
	await expect(milestones.locator('li')).toHaveText([
		/Milestone 1 in progress\s*Community 0 of \d · Outdoors 1 of \d/,
		/Milestone 2 in progress\s*Community 2 of \d · Outdoors 0 of \d/
	]);
	// With two on the go, the summary counts milestones rather than one milestone's activities
	await expect(liam.locator('.tile').nth(1)).toHaveText(/Milestones\s*0 done/);
});

test('the section logo is offered only to the members trying it out', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'progress/report/');
	await expect(page.locator('.report').first()).toBeVisible();
	await expect(page.getByLabel('Section logo')).toHaveCount(0);
	await expect(page.locator('.section-logo')).toHaveCount(0);
});

test('for a member trying it out, the report has the section logo, which can be left off', async ({
	page
}) => {
	await fakeTerrain(page, { memberNumber: '256412' });
	await logIn(page);
	await navigate(page, 'progress/report/');
	const ava = page.locator('.report').filter({ hasText: 'Ava Nguyen' });
	// Reversed on the navy band in colour, black in black and white
	const logo = ava.getByRole('img', { name: 'Scouts' });
	await expect(logo).toHaveAttribute('src', /section-logos\/scout-colour\.png$/);
	expect(
		await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)
	).toBeGreaterThan(0);
	await page.getByRole('radio', { name: 'Black and white' }).check();
	await expect(logo).toHaveAttribute('src', /section-logos\/scout-black\.png$/);
	await page.getByLabel('Section logo').uncheck();
	await expect(ava.locator('.section-logo')).toHaveCount(0);
});
