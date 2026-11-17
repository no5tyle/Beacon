import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('Record moves between OAS, Activity and SIA plan, staying the current tab', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'oas/sign-off/');
	const record = page.getByRole('navigation', { name: 'Record' });
	await expect(record.getByRole('link')).toHaveText(['OAS', 'Activity', 'SIA']);
	await record.getByRole('link', { name: 'Activity' }).click();
	await expect(page.locator('h2')).toHaveText('Log an Activity');
	await expect(record.getByRole('link', { name: 'Activity' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const current = isMobile
		? page.locator('.tab-bar .tab.active')
		: page.locator('.side-link.active');
	await expect(current).toHaveText('Record');
	await record.getByRole('link', { name: 'SIA', exact: true }).click();
	await expect(page.locator('h2')).toHaveText('Plan an SIA');
	await expect(current).toHaveText('Record');
});

test('logs a camp that’s over: details, who came, logbook, how it went, then saves and concludes it', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	const next = page.getByRole('button', { name: /^Next/ });

	// One activity, with a tick for one over more than one day
	await expect(page.getByLabel('Ends on')).toHaveCount(0);
	await page.getByLabel(/Runs over more than one day/).check();
	// Midday to midday, ending today or, before midday, yesterday
	await expect(page.getByLabel('From')).toHaveValue('12:00');
	await expect(page.getByLabel('To')).toHaveValue('12:00');
	const ends = await page.getByLabel('Ends on').inputValue();
	const starts = await page.getByLabel('Starts on').inputValue();
	expect(Date.parse(ends) - Date.parse(starts)).toBe(86_400_000);
	await expect(next).toBeDisabled();
	await page.getByLabel('Title').fill('Spring camp');
	await page.getByLabel('Where').fill('The hall');
	await page.getByLabel('Starts on').fill('2026-10-23');
	await page.getByLabel('Ends on').fill('2026-10-25');
	// Every activity has a logbook and a review step
	await expect(page.locator('.step-caption')).toHaveText('Activity · 1 of 5');
	await expect(page.locator('.step-bar li.current')).toHaveText('Activity');
	await expect(page.locator('.step-bar li')).toHaveText([
		'Activity',
		'Who came',
		'Logbook',
		'How it went',
		'Save'
	]);
	await page.getByRole('button', { name: 'Outdoors' }).click();
	await next.click();

	await expect(next).toBeDisabled();
	await page.getByRole('button', { name: 'Everyone' }).click();
	await expect(page.locator('.attendee.came')).toHaveCount(4);
	const ava = page.locator('.attendee', { hasText: 'Ava Nguyen' });
	await ava.getByRole('button', { name: 'Ava Nguyen led it' }).click();
	await page.getByRole('button', { name: 'Mia Brown led it' }).click();
	// More than one can lead, and there's no assisting
	await expect(page.getByRole('button', { name: /Assist/ })).toHaveCount(0);
	await page.locator('.attendee', { hasText: 'Noah Jones' }).getByRole('checkbox').uncheck();
	await next.click();
	await expect(page.locator('.step-caption')).toHaveText('Logbook · 3 of 5');
	await expect(page.locator('.step-bar li.done')).toHaveCount(2);

	// Two nights from the dates, and the walking they did, for everyone who came
	await expect(page.locator('.nights')).toContainText('2 nights away');
	await expect(page.getByLabel(/They camped/)).toBeChecked();
	await expect(page.getByText('Counts towards the Walkabout award')).toHaveCount(0);
	await page.getByLabel(/Kilometres walked/).fill('6');
	await expect(page.getByLabel('Counts towards the Walkabout award')).toBeChecked();
	await next.click();

	// It's over, so Terrain concludes it with a review
	await expect(next).toBeDisabled();
	await page.getByRole('button', { name: 'Great' }).click();
	await page.getByRole('button', { name: 'Challenging' }).click();
	await page.getByRole('button', { name: 'Fun' }).click();
	await page.getByLabel('Nature and outdoors').check();
	await page.getByLabel('Learning by doing').check();
	await page.getByLabel('Physical').check();
	await next.click();

	const review = page.locator('.review');
	await expect(review.locator('h3')).toHaveText('Spring camp');
	await expect(review).toContainText('2026-10-23 12:00 to 2026-10-25 12:00');
	await expect(review).toContainText('Outdoors');
	await expect(review).toContainText('3 came, 2 led');
	await expect(review).toContainText(
		'2 nights away, towards camping, 6 km walked, towards Walkabout'
	);
	await expect(review.locator('li')).toHaveText([
		'Ava Nguyen (led)',
		'Liam Smith',
		'Mia Brown (led)'
	]);
	expect(terrain.writes).toEqual([]);

	// Saved to the unit's programme already concluded, as the leader, with who came in each role
	const before = terrain.requests.length;
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		"Saved Spring camp to the unit's programme in Terrain, concluded, so those who came get credit for it."
	);
	expect(terrain.writes.map((w) => w.request)).toEqual(['POST events/units/unit-1/events']);
	const body = terrain.writes[0].body as Record<string, unknown>;
	expect(body).toMatchObject({
		title: 'Spring camp',
		location: 'The hall',
		organisers: ['leader-1'],
		challenge_area: 'outdoors',
		event_type: { type: 'unit', id: 'unit-1' },
		attendance: {
			leader_member_ids: ['unit-1-m0', 'unit-1-m2'],
			assistant_member_ids: [],
			attendee_member_ids: ['unit-1-m0', 'unit-1-m1', 'unit-1-m2'],
			participant_member_ids: ['unit-1-m0', 'unit-1-m1', 'unit-1-m2']
		},
		achievement_pathway_logbook_data: {
			distance_travelled: 6000,
			distance_walkabout: 6000,
			achievement_meta: { stream: 'camping', branch: 'camping' },
			categories: ['camping', 'walking_hike']
		},
		status: 'concluded',
		review: {
			general_tags: ['fun', 'challenging'],
			scout_method_elements: ['learn_by_doing', 'nature_and_outdoors'],
			scout_spices_elements: ['physical'],
			general_rating: 'great'
		}
	});
	expect(String(body.start_datetime)).toMatch(/^2026-10-2[23]T\d{2}:\d{2}:00\.000\+00:00$/);
	// Saved as the leader: no switch to a youth's profile while saving
	expect(terrain.requests.slice(before).some((r) => r.includes('assume-profiles'))).toBe(false);

	await page.getByRole('button', { name: 'Log another activity' }).click();
	await expect(page.getByLabel('Title')).toHaveValue('');
});

test('an evening at the hall has an empty logbook, and is concluded with its review', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	// One day: the date, and it ends that day
	await page.getByLabel('Date').fill('2026-10-20');
	await page.getByLabel('From').fill('18:30');
	await page.getByLabel('To').fill('20:00');
	await expect(page.locator('.step-bar li')).toHaveText([
		'Activity',
		'Who came',
		'Logbook',
		'How it went',
		'Save'
	]);
	await page.getByLabel('Title').fill('Knots night');
	await page.getByLabel('Where').fill('The hall');
	await page.getByRole('button', { name: 'Creative' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	// No nights away, and no walking
	await expect(page.locator('.nights')).toHaveCount(0);
	await expect(page.getByText('No nights away.')).toBeVisible();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByRole('button', { name: 'Okay' }).click();
	await page.getByLabel('Patrol system').check();
	await page.getByLabel('Social').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await expect(page.locator('.review')).toContainText('2026-10-20, 18:30 to 20:00');
	await expect(page.locator('.review')).toContainText('1 came');
	await expect(page.locator('.review')).toContainText('Okay');
	await expect(page.locator('.review')).toContainText('Logbook');
	await expect(page.locator('.review')).toContainText('Nothing');
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-success')).toContainText(', concluded,');
	expect(terrain.writes.map((w) => w.request)).toEqual(['POST events/units/unit-1/events']);
	expect(terrain.writes[0].body).toMatchObject({
		achievement_pathway_logbook_data: { distance_travelled: 0, categories: [] }
	});
	// The next one-day activity starts with the same times
	await page.getByRole('button', { name: 'Log another activity' }).click();
	await expect(page.getByLabel('From')).toHaveValue('18:30');
	await expect(page.getByLabel('To')).toHaveValue('20:00');
});

test('nights away count towards camping when they camped', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	await page.getByLabel(/Runs over more than one day/).check();
	await page.getByLabel('Starts on').fill('2026-10-17');
	await page.getByLabel('Ends on').fill('2026-10-18');
	await page.getByLabel('Title').fill('Heysen Trail');
	await page.getByLabel('Where').fill('Mount Lofty');
	await page.getByRole('button', { name: 'Outdoors' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await expect(page.locator('.nights')).toContainText('1 night away');
	await page.getByLabel(/Kilometres walked/).fill('18');
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByRole('button', { name: 'Great' }).click();
	await page.getByLabel('Nature and outdoors').check();
	await page.getByLabel('Physical').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await expect(page.locator('.review')).toContainText(
		'1 night away, towards camping, 18 km walked'
	);
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-success')).toContainText(', concluded,');
	expect(terrain.writes[0].body).toMatchObject({
		achievement_pathway_logbook_data: {
			distance_travelled: 18000,
			distance_walkabout: 18000,
			achievement_meta: { stream: 'camping', branch: 'camping' },
			categories: ['camping', 'walking_hike']
		}
	});
});

test('nights away without camping don’t count towards camping', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	await page.getByLabel(/Runs over more than one day/).check();
	await page.getByLabel('Starts on').fill('2026-10-17');
	await page.getByLabel('Ends on').fill('2026-10-18');
	await page.getByLabel('Title').fill('Jamboree day trip');
	await page.getByLabel('Where').fill('Woodhouse');
	await page.getByRole('button', { name: 'Community' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByLabel(/They camped/).uncheck();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByRole('button', { name: 'Great' }).click();
	await page.getByLabel('Community involvement').check();
	await page.getByLabel('Social').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await expect(page.locator('.review')).toContainText('1 night away');
	await expect(page.locator('.review')).not.toContainText('towards camping');
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-success')).toContainText(', concluded,');
	expect(terrain.writes[0].body).toMatchObject({
		achievement_pathway_logbook_data: { categories: [] }
	});
});

test('only takes activities that are over', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	// It starts on one that's already over
	await expect(page.locator('.text-danger')).toHaveCount(0);
	await page.getByLabel('Title').fill('Knots night');
	await page.getByLabel('Where').fill('The hall');
	await page.getByRole('button', { name: 'Creative' }).click();
	await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();
	// Where it was is needed
	await page.getByLabel('Where').fill('');
	await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();
	await page.getByLabel('Where').fill('The hall');
	// Moved to the future, it can't go on
	await page.getByLabel('Date').fill('2030-03-07');
	await expect(page.locator('.text-danger')).toHaveText(
		"It hasn't finished yet. Log activities once they're over."
	);
	await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();
	expect(terrain.writes).toEqual([]);
});

test('says when Terrain won’t take the activity, and keeps it to try again', async ({ page }) => {
	await fakeTerrain(page);
	await page.route(/events\.terrain\.scouts\.com\.au\/units\/[^/]+\/events$/, (route) =>
		route.request().method() === 'POST'
			? route.fulfill({
					status: 400,
					headers: { 'access-control-allow-origin': '*' },
					body: '{}'
				})
			: route.fallback()
	);
	await logIn(page);
	await navigate(page, 'record/activity/');
	await page.getByLabel('Date').fill('2026-10-20');
	await page.getByLabel('Title').fill('Knots night');
	await page.getByLabel('Where').fill('The hall');
	await page.getByRole('button', { name: 'Community' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByRole('button', { name: 'Great' }).click();
	await page.getByLabel('Community involvement').check();
	await page.getByLabel('Social').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-danger')).toContainText(
		"Terrain didn't accept the activity (response 400)"
	);
	await expect(page.getByRole('button', { name: 'Save to Terrain' })).toBeEnabled();
});

test('starts an SIA plan for a youth and submits it for approval, as Terrain does', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/sia-plan/');
	await expect(page.locator('h2')).toHaveText('Plan an SIA');
	await page.getByLabel('Liam Smith').check();
	await page.getByRole('button', { name: 'Next: Projects' }).click();
	await page.getByRole('button', { name: 'New plan' }).click();

	// First the questions Terrain requires: the area and the project's name
	await expect(page.getByRole('region', { name: 'Project Details' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Who' })).toHaveCount(0);
	await expect(page.locator('#sia-step_1')).toHaveCount(0);
	// Starting a project can't be undone
	await expect(page.locator('.undo-note')).toContainText("it can't be undone");
	await page.getByRole('button', { name: 'Next: Details' }).click();
	await expect(page.locator('.alert-danger')).toHaveText(
		'Fill in: Pick the Special Interest Area, Name your project.'
	);
	await page.getByRole('button', { name: 'STEM & Innovation' }).click();
	await page.getByLabel('Name your project*').fill('Build a robot');
	await page.getByRole('button', { name: 'Next: Details' }).click();

	// Then the rest, all optional
	await expect(page.locator('.optional-note')).toContainText('Everything on this page is optional');
	await expect(page.locator('.undo-note')).toContainText(
		"Saving starts this project in Terrain, and submitting can't be undone"
	);
	await expect(page.getByRole('region', { name: 'Goals' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Who' })).toBeVisible();
	await expect(page.getByLabel('Name your project*')).toHaveCount(0);
	await page.locator('#sia-step_1').fill('Find a kit');
	await page.getByLabel('By myself').check();
	await page.getByRole('button', { name: 'Save and submit' }).click();
	await expect(page.locator('.alert-success')).toContainText('Submitted.');
	await expect(page.locator('.subtitle')).toContainText('Plan waiting for approval');

	// Started as Terrain starts one, as Liam, then submitted for approval on his behalf
	const created = terrain.writes.find(
		(w) => w.request === 'POST achievements/members/unit-1-m1/achievements'
	);
	expect(created?.body).toEqual({
		achievement_type: 'special_interest_area',
		template: 'sia/scout/plan',
		version: 2,
		section: 'scout',
		answers: {
			special_interest_area_selection: 'sia_stem_innovation',
			project_name: 'Build a robot',
			step_1: 'Find a kit',
			who_is_involved: 'who_involved_by_myself'
		},
		uploads: []
	});
	const submitted = terrain.writes.find((w) => w.request.endsWith('/submit-on-behalf'));
	expect(submitted?.body).toEqual({
		type: 'approval',
		unit_id: 'unit-1',
		submitted_by: 'leader-1'
	});
	expect(terrain.requests).toContain('POST members/members/unit-1-m1/assume-profiles');
});

test('carries on a saved SIA plan, keeping it unsubmitted', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/sia-plan/');
	await page.getByLabel('Mia Brown').check();
	await page.getByRole('button', { name: 'Next: Projects' }).click();
	// Her projects, the plan in progress opening to carry on
	await expect(page.getByRole('button', { name: 'Food drive' })).toContainText(
		'Creating a Better World · Plan in progress'
	);
	await page.getByRole('button', { name: 'Food drive' }).click();
	await expect(page.getByLabel('Name your project*')).toHaveValue('Food drive');
	await page.getByRole('button', { name: 'Next: Details' }).click();
	await page.getByLabel('What do I/we want to learn or do?').fill('Collect 100 tins');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		'Plan saved to Terrain. It isn’t submitted yet.'
	);
	const saved = terrain.writes.find((w) =>
		w.request.startsWith('PUT achievements/members/unit-1-m2')
	);
	expect(saved?.body).toMatchObject({
		achievement_type: 'special_interest_area',
		template: 'sia/scout/plan',
		answers: {
			special_interest_area_selection: 'sia_better_world',
			project_name: 'Food drive',
			want_to_achieve: 'Collect 100 tins'
		},
		reset_to_draft: false
	});
	expect(terrain.writes.some((w) => w.request.endsWith('/submit-on-behalf'))).toBe(false);
});

test('youth members can’t log activities, though they have the SIA page', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await navigate(page, 'record/sia-plan/');
	await expect(page.locator('h2')).toHaveText('Plan an SIA');
	await page.evaluate(() => {
		const home = document.querySelector('a.brand')?.getAttribute('href') ?? '/';
		const link = document.createElement('a');
		link.href = home + 'record/activity/';
		document.body.appendChild(link);
		link.click();
		link.remove();
	});
	await expect(page).not.toHaveURL(/\/record\//);
});

test('writes the review of an approved SIA plan and submits it for review, as Terrain does', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/sia-plan/');
	await page.getByLabel('Liam Smith').check();
	await page.getByRole('button', { name: 'Next: Projects' }).click();
	await expect(page.getByRole('button', { name: 'Plant trees' })).toContainText(
		'Plan approved, review to do'
	);
	await page.getByRole('button', { name: 'Plant trees' }).click();

	// The review's own questions, all optional; files are attached in Terrain
	await expect(page.locator('.step-bar')).toContainText('Review');
	await expect(page.locator('.optional-note')).toContainText('Every question is optional');
	await expect(page.getByLabel('Name your project*')).toHaveCount(0);
	await expect(page.getByLabel('Do you have any files to attach here?')).toHaveCount(0);
	await page.getByLabel('What was the most important thing you learned?').fill('Roots need water');
	await page.getByRole('button', { name: 'Save and submit' }).click();
	await expect(page.locator('.alert-success')).toContainText(
		'The review now waits for the Unit Council'
	);

	// Saved to the same record, with its plan template and attached documents, then submitted for review
	const saved = terrain.writes.find((w) =>
		w.request.startsWith('PUT achievements/members/unit-1-m1')
	);
	expect(saved?.body).toMatchObject({
		template: 'sia/scout/plan',
		answers: {
			attach_documentation: [],
			project_name: 'Plant trees',
			important_learned: 'Roots need water'
		},
		reset_to_draft: false
	});
	const submitted = terrain.writes.find((w) => w.request.endsWith('/submit-on-behalf'));
	expect(submitted?.body).toEqual({ type: 'review', unit_id: 'unit-1', submitted_by: 'leader-1' });
});
