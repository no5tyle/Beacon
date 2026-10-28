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
	await expect(statements.locator('.stage', { hasText: 'Stage 4' }).locator('li')).toHaveText([
		/I can tie a reef knot and a clove hitch\./,
		/I can talk about what went well/
	]);
	await page.getByLabel('Achieved "I" statements').check();
	await expect(statements.locator('.stage', { hasText: 'Stage 4' }).locator('li')).toHaveCount(6);
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
	// Ava's report takes 3 pages, Liam's and Mia's 2 each, and Noah's 1
	await page.getByLabel('Achieved "I" statements').check();
	await page.getByLabel('"I" statements still to do').check();
	await page.getByLabel('Non-core streams').check();
	// Non-core streams load the reports again
	await expect(page.getByText('Preparing reports')).toHaveCount(0);
	await expect(page.locator('.statements-page')).toHaveCount(3);
	expect(await print()).toBe(8);

	// A blank page after Ava's; Noah's comes last, so nothing follows it
	await page.getByLabel('Double-sided: each report starts on a new sheet').check();
	expect(await print()).toBe(9);
	await expect(page.locator('.blank-page')).toHaveCount(1);
	await expect(page.locator('.report').first().locator('+ .blank-page')).toHaveCount(1);

	// Just the front pages: a blank after each but the last
	await page.getByLabel('Outdoor Adventure Skills').uncheck();
	expect(await print()).toBe(7);
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
