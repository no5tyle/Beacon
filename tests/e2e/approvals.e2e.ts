import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('lists what is waiting for the Unit Council, with who has voted', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	await expect(page.locator('h2')).toHaveText('Approvals');
	await expect(page.locator('.summary')).toHaveText(
		'Mt Example Scouts · 4 to approve · 1 to award'
	);
	// Reviews to approve, then awards, each grouped by youth and named for what it is
	const toApprove = page.getByRole('region', { name: /^To approve/ });
	const toAward = page.getByRole('region', { name: /^Ready to award/ });
	await expect(toApprove.locator('.group-heading')).toHaveText([
		'Ava Nguyen (1)',
		'Liam Smith (1)',
		'Mia Brown (1)',
		'Noah Jones (1)'
	]);
	await expect(toAward.locator('.group-heading')).toHaveText(['Noah Jones (1)']);
	await expect(toApprove.getByRole('region', { name: 'Noah Jones' }).locator('.strong')).toHaveText(
		'Intro To Section'
	);
	await expect(toAward.getByRole('region', { name: 'Noah Jones' }).locator('.strong')).toHaveText(
		'OAS Bushcraft 1'
	);
	const milestone = page.getByRole('region', { name: 'Liam Smith' }).locator('.approval-card');
	await expect(milestone).toContainText('Review · submitted 3 days ago');
	await expect(milestone).toContainText('1 of 2 approved (Kim Leader)');
	await expect(milestone.getByRole('button', { name: 'Approve' })).toBeVisible();
	// Already voted on, or not this leader's to action: no button
	const voted = page.getByRole('region', { name: 'Ava Nguyen' }).locator('.approval-card');
	await expect(voted).toContainText("You've voted on this one.");
	await expect(voted.getByRole('button', { name: 'Approve' })).toHaveCount(0);
	await expect(
		page.getByRole('region', { name: 'Noah Jones' }).getByRole('button', { name: 'Approve' })
	).toHaveCount(0);

	// No youth filter, just a choice of grouping
	await expect(page.getByRole('button', { name: 'Everyone' })).toHaveCount(0);
	await page.selectOption('#groupBy', 'achievement');
	await expect(toApprove.locator('.group-heading')).toHaveText([
		'Adventure Sport (1)',
		'Intro To Section (1)',
		'Milestone 1 (1)',
		'OAS Camping 1 (1)'
	]);
	await expect(toAward.locator('.group-heading')).toHaveText(['OAS Bushcraft 1 (1)']);
	await expect(
		page.getByRole('region', { name: 'Milestone 1' }).locator('.approval-card .strong')
	).toHaveText('Liam Smith');
});

test('approves after confirming, sending what Terrain’s Approvals tab sends', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	const card = page.getByRole('region', { name: 'Mia Brown' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	await expect(card.locator('.confirm-box')).toContainText('Approve OAS Camping 1 for Mia Brown?');
	await expect(card.locator('.confirm-box')).toContainText('this would be approval 1 of 2');
	await card.getByRole('button', { name: 'Cancel' }).click();
	expect(terrain.writes).toEqual([]);

	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		'Approved OAS Camping 1 for Mia Brown. It needs 1 more Unit Council member to approve.'
	);
	expect(terrain.writes).toEqual([
		{
			request: 'POST achievements/submissions/sub-2/assessments',
			body: { outcome: 'approved', comment: '' }
		}
	]);
	// The list is loaded again and shows the vote
	await expect(card).toContainText('1 of 2 approved (Sam Leader)');
	await expect(card).toContainText("You've voted on this one.");
});

test('the second approval sends it through, and it leaves the list', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	const card = page.getByRole('region', { name: 'Liam Smith' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Approved Milestone 1 for Liam Smith.');
	await expect(
		page.getByRole('region', { name: 'Liam Smith' }).locator('.approval-card')
	).toHaveCount(0);
	await expect(page.locator('.summary')).toHaveText(
		'Mt Example Scouts · 3 to approve · 1 to award'
	);
});

test('youth members don’t see Approvals', async ({ page, isMobile }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	if (isMobile) await page.getByRole('button', { name: 'More' }).click();
	await expect(page.getByRole('link', { name: 'Approvals' })).toHaveCount(0);
});

test('a badge on More and Approvals shows what waits for the leader’s vote or award', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page);
	await logIn(page);
	// Liam's milestone, Mia's camping and Noah's bushcraft award: Ava's is voted on already, and Noah's intro
	// isn't this leader's
	if (isMobile) {
		const more = page.getByRole('button', { name: 'More, 3 waiting' });
		await expect(more.locator('.tab-badge')).toHaveText('3');
		await more.click();
		await expect(
			page.locator('.more-item', { hasText: 'Approvals' }).locator('.nav-badge')
		).toHaveText(/^3/);
		await page.locator('.more-item', { hasText: 'Approvals' }).click();
	} else {
		await expect(
			page.locator('.side-link', { hasText: 'Approvals' }).locator('.nav-badge')
		).toHaveText(/^3/);
		await navigate(page, 'approvals/');
	}

	const card = page.getByRole('region', { name: 'Mia Brown' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(card).toContainText("You've voted on this one.");
	if (isMobile) await expect(page.locator('.tab-badge')).toHaveText('2');
	else
		await expect(
			page.locator('.side-link', { hasText: 'Approvals' }).locator('.nav-badge')
		).toHaveText(/^2/);
});

test('no badge when nothing waits for the leader', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await expect(page.locator('.tab-badge, .nav-badge')).toHaveCount(0);
});

test('History lists what the Unit Council has finished with, most recent first', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	await expect(page.getByRole('tab', { name: /Waiting/ })).toContainText('5');
	await page.getByRole('tab', { name: 'History' }).click();
	await expect
		.poll(() => terrain.requests.some((r) => r.includes('submissions?status=finalised')))
		.toBe(true);

	const cards = page.locator('.history-card');
	await expect(cards).toHaveCount(2);
	await expect(cards.nth(0)).toContainText('Ava Nguyen');
	await expect(cards.nth(0)).toContainText('Approved');
	await expect(cards.nth(0)).toContainText('OAS Bushwalking 3');
	await expect(cards.nth(0)).toContainText(/decided 10 days ago · submitted \d{1,2} \w+ \d{4}/);
	await expect(cards.nth(0)).toContainText('Approved by Kim Leader, Sam Leader');
	await expect(cards.nth(1)).toContainText('Liam Smith');
	await expect(cards.nth(1)).toContainText('Needs improvement');
	await expect(cards.nth(1)).toContainText('Improvement asked by Kim Leader');

	// Older than 90 days only on request
	await page.getByRole('button', { name: 'Show older (1)' }).click();
	await expect(cards).toHaveCount(3);
	await expect(cards.nth(2)).toContainText('Mia Brown');
	await expect(cards.nth(2)).toContainText('Intro To Scouting');

	// A compact pick of youth: closed, it says who's shown
	const youth = page.getByRole('button', { name: 'Youth' });
	await expect(youth).toHaveText('Everyone');
	await youth.click();
	const list = page.getByRole('listbox', { name: 'Youth' });
	await list.getByLabel('Liam Smith').check();
	await expect(cards).toHaveCount(1);
	await expect(youth).toHaveText('Liam Smith');
	await list.getByLabel('Mia Brown').check();
	await expect(cards).toHaveCount(2);
	await expect(youth).toHaveText('2 youth');
	// Closes on Escape, and Everyone shows them all again
	await page.keyboard.press('Escape');
	await expect(list).toHaveCount(0);
	await youth.click();
	await list.getByLabel('Everyone').check();
	await expect(cards).toHaveCount(3);
	await expect(youth).toHaveText('Everyone');
});

test('something approved through shows in the History', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	await page.getByRole('tab', { name: 'History' }).click();
	await expect(page.locator('.history-card')).toHaveCount(2);

	await page.getByRole('tab', { name: /Waiting/ }).click();
	const card = page.getByRole('region', { name: 'Liam Smith' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Approved Milestone 1 for Liam Smith.');

	await page.getByRole('tab', { name: 'History' }).click();
	const first = page.locator('.history-card').first();
	await expect(first).toContainText('Liam Smith');
	await expect(first).toContainText('Milestone 1');
	await expect(first).toContainText('decided today');
});

test('what the leader did shows at once, even while Terrain is slow to list it', async ({
	page
}) => {
	const terrain = await fakeTerrain(page, { staleReads: 2 });
	await logIn(page);
	await navigate(page, 'approvals/');
	// A first approval: the vote shows although Terrain's next reads still have none
	const mia = page.getByRole('region', { name: 'Mia Brown' }).locator('.approval-card');
	await mia.getByRole('button', { name: 'Approve' }).click();
	await mia.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(mia).toContainText('1 of 2 approved (Sam Leader)');
	await expect(mia).toContainText("You've voted on this one.");
	// The deciding approval: it leaves the list straight away and stays gone
	const liam = page.getByRole('region', { name: 'Liam Smith' }).locator('.approval-card');
	await liam.getByRole('button', { name: 'Approve' }).click();
	await liam.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(liam).toHaveCount(0);
	await expect(page.locator('.summary')).toHaveText(
		'Mt Example Scouts · 3 to approve · 1 to award'
	);
	// Terrain is checked again until it catches up
	await expect
		.poll(() => terrain.requests.filter((r) => r.includes('/submissions?status=pending')).length)
		.toBeGreaterThanOrEqual(5);
	await expect(liam).toHaveCount(0);
	await expect(mia).toContainText('1 of 2 approved (Sam Leader)');
});

test('an award leaves the list at once, even while Terrain is slow to list it', async ({
	page
}) => {
	await fakeTerrain(page, { staleReads: 1 });
	await logIn(page);
	await navigate(page, 'approvals/');
	const award = page.locator('.approval-card', { hasText: 'Award ·' });
	await page.getByLabel('Award OAS Bushcraft 1 to Noah Jones').check();
	await page.getByRole('button', { name: /^Award 1$/ }).click();
	await page.getByRole('button', { name: 'Yes, award' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Awarded OAS Bushcraft 1 to Noah Jones.');
	await expect(award).toHaveCount(0);
	await expect(page.getByRole('region', { name: /^Ready to award/ })).toHaveCount(0);
});

test('the deciding approval of a special interest area plan can move it on to the review', async ({
	page
}) => {
	const terrain = await fakeTerrain(page, { siaPlan: true });
	await logIn(page);
	await navigate(page, 'approvals/');
	const card = page.getByRole('region', { name: 'Ava Nguyen' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	// Named for the project, with its area underneath
	await expect(card.locator('.strong')).toHaveText('Bracelet making business');
	await expect(card.locator('.subtitle')).toHaveText('Adventure Sport · Plan');
	await expect(card.locator('.confirm-box')).toContainText(
		'Approve Bracelet making business for Ava Nguyen?'
	);
	const box = card.getByLabel("If it's the plan, move it on to the review for Ava Nguyen");
	await expect(box).toBeChecked();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		'Approved Bracelet making business for Ava Nguyen. Moved it on to the review.'
	);
	expect(terrain.writes).toEqual([
		{
			request: 'POST achievements/submissions/sub-3/assessments',
			body: { outcome: 'approved', comment: '' }
		},
		{
			request: 'PUT achievements/members/unit-1-m0/achievements/ach-sub-3',
			body: {
				achievement_type: 'special_interest_area',
				template: 'sia/scout/plan',
				version: 2,
				section: 'scout',
				answers: {
					attach_documentation: [],
					project_name: 'Bracelet making business',
					special_interest_area_selection: 'sia_adventure_sport'
				},
				uploads: [],
				reset_to_draft: false
			}
		}
	]);
	// Sent as Ava, and switched back afterwards
	const put = terrain.requests.indexOf('PUT achievements/members/unit-1-m0/achievements/ach-sub-3');
	expect(terrain.requests.slice(0, put)).toContain(
		'POST members/members/unit-1-m0/assume-profiles'
	);
	expect(terrain.requests.slice(put)).toContain('POST members/revoke-assumed-profiles');
});

test('unticked, the deciding approval of a plan only approves', async ({ page }) => {
	const terrain = await fakeTerrain(page, { siaPlan: true });
	await logIn(page);
	await navigate(page, 'approvals/');
	const card = page.getByRole('region', { name: 'Ava Nguyen' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByLabel("If it's the plan, move it on to the review for Ava Nguyen").uncheck();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		'Approved Bracelet making business for Ava Nguyen.'
	);
	expect(terrain.writes.map((w) => w.request)).toEqual([
		'POST achievements/submissions/sub-3/assessments'
	]);
});

test('no move-on box on a first approval', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	const card = page.getByRole('region', { name: 'Mia Brown' }).locator('.approval-card');
	await card.getByRole('button', { name: 'Approve' }).click();
	await expect(card.getByRole('checkbox')).toHaveCount(0);
});

test('awards after confirming the date, sending what Terrain’s Approvals tab sends', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	const section = page.getByRole('region', { name: /^Ready to award/ });
	await expect(section).toContainText('Approved by the Unit Council.');
	const award = section.locator('.approval-card');
	await expect(award).toContainText('Award · submitted 2 days ago');
	await expect(award).not.toContainText('of 2 approved');
	await expect(award.getByRole('button', { name: 'Approve' })).toHaveCount(0);
	// Nothing ticked, nothing to award
	await expect(section.getByRole('button', { name: /^Award/ })).toBeDisabled();

	await section.getByLabel('Award OAS Bushcraft 1 to Noah Jones').check();
	await section.getByRole('button', { name: 'Award 1' }).click();
	const confirm = section.locator('.confirm-box');
	await expect(confirm).toContainText('Award OAS Bushcraft 1 to Noah Jones?');
	const date = confirm.getByLabel('Date awarded');
	const today = await page.evaluate(() => {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	});
	await expect(date).toHaveValue(today);
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	expect(terrain.writes).toEqual([]);

	await section.getByRole('button', { name: 'Award 1' }).click();
	await confirm.getByLabel('Date awarded').fill('2026-01-15');
	await confirm.getByRole('button', { name: 'Yes, award' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Awarded OAS Bushcraft 1 to Noah Jones.');
	expect(terrain.writes).toEqual([
		{
			request: 'POST achievements/submissions/sub-5/assessments',
			body: { outcome: 'awarded', date_awarded: '2026-01-15' }
		}
	]);
	// Awarded, it leaves the list, and with nothing left to award so does the section
	await expect(section).toHaveCount(0);
	await expect(page.locator('.summary')).toHaveText('Mt Example Scouts · 4 to approve');
});

test('lists every unit the leader is on the Unit Council for, grouped by unit', async ({
	page
}) => {
	const units = [
		{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' },
		{ id: 'unit-2', name: 'Mt Example Cubs', section: 'cub' },
		{ id: 'unit-3', name: 'Mt Example Joeys', section: 'joey' }
	];
	const terrain = await fakeTerrain(page, { units, refuseApprovals: ['unit-3'] });
	await logIn(page);
	await navigate(page, 'approvals/');
	// Joeys refuses: not on its Unit Council, so it's simply left out
	await expect(page.locator('.unit-heading')).toHaveText([
		/^Mt Example Scouts\s+· 4 to approve · 1 to award$/,
		/^Mt Example Cubs\s+· 4 to approve · 1 to award$/
	]);
	await expect(page.locator('.summary')).toHaveText('1st Example · 8 to approve · 2 to award');
	await expect(page.locator('.alert-warning')).toHaveCount(0);
	const cubs = page.getByRole('region', { name: 'Mt Example Cubs' });
	await expect(
		cubs.getByRole('region', { name: 'To approve' }).locator('.group-heading')
	).toHaveText(['Ava Nguyen (1)', 'Liam Smith (1)', 'Mia Brown (1)', 'Noah Jones (1)']);

	// Approving in one unit leaves the other as it was
	const mia = cubs.getByRole('region', { name: 'Mia Brown' }).locator('.approval-card');
	await mia.getByRole('button', { name: 'Approve' }).click();
	await mia.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(mia).toContainText("You've voted on this one.");
	expect(terrain.writes.map((w) => w.request)).toEqual([
		'POST achievements/submissions/unit-2-sub-2/assessments'
	]);
	await expect(
		page
			.getByRole('region', { name: 'Mt Example Scouts' })
			.getByRole('region', { name: 'Mia Brown' })
			.getByRole('button', { name: 'Approve' })
	).toBeVisible();

	// The history of both, each card saying its unit
	await page.getByRole('tab', { name: 'History' }).click();
	await expect(page.locator('.history-card').first()).toContainText(/Mt Example (Scouts|Cubs) · /);
});

test('a leader on no Unit Council is told why nothing is listed', async ({ page }) => {
	await fakeTerrain(page, { refuseApprovals: ['unit-1'] });
	await logIn(page);
	await navigate(page, 'approvals/');
	await expect(page.locator('.approvals-empty')).toContainText(
		"Terrain doesn't list approvals for you in any of your units"
	);
});

test('awards several together, on one date', async ({ page }) => {
	const terrain = await fakeTerrain(page, { moreAwards: true });
	await logIn(page);
	await navigate(page, 'approvals/');
	const section = page.getByRole('region', { name: /^Ready to award/ });
	await expect(section.locator('.group-heading')).toHaveText([
		'Liam Smith (1)',
		'Mia Brown (1)',
		'Noah Jones (1)'
	]);
	await section.getByRole('button', { name: 'Tick all' }).click();
	await section.getByLabel('Award Milestone 1 to Liam Smith').uncheck();
	await section.getByRole('button', { name: 'Award 2' }).click();
	const confirm = section.locator('.confirm-box');
	await expect(confirm).toContainText('Award these 2?');
	await expect(confirm.locator('li')).toHaveText([
		'OAS Camping 1, Mia Brown',
		'OAS Bushcraft 1, Noah Jones'
	]);
	await confirm.getByLabel('Date awarded').fill('2026-10-01');
	await confirm.getByRole('button', { name: 'Yes, award' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Awarded 2.');
	expect(terrain.writes).toEqual([
		{
			request: 'POST achievements/submissions/sub-7/assessments',
			body: { outcome: 'awarded', date_awarded: '2026-10-01' }
		},
		{
			request: 'POST achievements/submissions/sub-5/assessments',
			body: { outcome: 'awarded', date_awarded: '2026-10-01' }
		}
	]);
	// Only the unticked one is left
	await expect(section.locator('.group-heading')).toHaveText(['Liam Smith (1)']);
	await expect(section.getByRole('button', { name: 'Tick all' })).toBeVisible();
});
