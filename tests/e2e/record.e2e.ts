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
	await expect(record.getByRole('link')).toHaveText(['OAS', 'Activity', 'SIA plan']);
	await record.getByRole('link', { name: 'Activity' }).click();
	await expect(page.locator('h2')).toHaveText('Log activity');
	await expect(record.getByRole('link', { name: 'Activity' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const current = isMobile
		? page.locator('.tab-bar .tab.active')
		: page.locator('.side-link.active');
	await expect(current).toHaveText('Record');
	await record.getByRole('link', { name: 'SIA plan' }).click();
	await expect(page.locator('h2')).toHaveText('SIA plan');
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
	await expect(review).toContainText('2026-10-23 19:00 to 2026-10-25 21:00');
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
	await expect(page.locator('.review')).toContainText('2026-10-20, 19:00 to 21:00');
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

test('enters an SIA plan: youth, area and project, then a review that sends nothing', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/sia-plan/');
	const next = page.getByRole('button', { name: /^Next/ });
	await expect(next).toBeDisabled();
	await page.getByLabel('Mia Brown').check();
	await next.click();

	await expect(next).toBeDisabled();
	await page.getByRole('button', { name: 'Arts & Literature' }).click();
	await page.getByLabel('Project name').fill('Puppet show');
	await next.click();

	const review = page.locator('.review');
	await expect(review.locator('h3')).toHaveText('Puppet show');
	await expect(review).toContainText('Mia Brown');
	await expect(review).toContainText('Arts & Literature');
	await expect(page.getByRole('button', { name: 'Save to Terrain' })).toBeDisabled();
	expect(terrain.writes).toEqual([]);
});

test('youth members can’t log activities or plans', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	for (const path of ['record/activity/', 'record/sia-plan/']) {
		await navigate(page, path);
		await expect(page).not.toHaveURL(/\/record\//);
	}
});
