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

	await page.getByRole('button', { name: 'Camp', exact: true }).click();
	await expect(next).toBeDisabled();
	await page.getByLabel('Title').fill('Spring camp');
	await page.getByLabel('Starts').fill('2026-10-23');
	await page.getByLabel('Ends').fill('2026-10-25');
	// Over, so it has a review step
	await expect(page.locator('.steps li')).toHaveText([
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
	await ava.getByRole('button', { name: 'Leader' }).click();
	await page.locator('.attendee', { hasText: 'Noah Jones' }).getByRole('checkbox').uncheck();
	await next.click();

	// Two nights from the dates, the same for everyone unless changed
	await expect(page.getByLabel('Nights camped')).toHaveValue('2');
	await page.getByLabel('Kilometres hiked').fill('6');
	await page.getByText('Different for some youth').click();
	await page.getByLabel("Liam Smith's nights").fill('1');
	await page.getByLabel("Liam Smith's nights").blur();
	await next.click();

	// It's over, so Terrain concludes it with a review
	await expect(next).toBeDisabled();
	await page.getByRole('button', { name: 'Great' }).click();
	await page.getByLabel('Nature and outdoors').check();
	await page.getByLabel('Learning by doing').check();
	await page.getByLabel('Physical').check();
	await next.click();

	const review = page.locator('.review');
	await expect(review.locator('h3')).toHaveText('Spring camp');
	await expect(review).toContainText('2026-10-23 18:00 to 2026-10-25 12:00');
	await expect(review).toContainText('Outdoors');
	await expect(review).toContainText('2 participants, 1 leader');
	await expect(review).toContainText('2 nights, 6 km each, different for 1');
	await expect(review.locator('li')).toHaveText(['Ava Nguyen (Leader)', 'Liam Smith', 'Mia Brown']);
	// The logbook isn't sent yet, and says so
	await expect(page.locator('.alert-info')).toContainText("nights and kilometres aren't sent");
	expect(terrain.writes).toEqual([]);

	// Saved to the unit's programme as planned, as the leader, with who came in each role
	const before = terrain.requests.length;
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-success')).toHaveText(
		"Saved Spring camp to the unit's programme in Terrain and concluded it, so those who came get credit for it."
	);
	expect(terrain.writes.map((w) => w.request)).toEqual([
		'POST events/units/unit-1/events',
		'PATCH events/events/event-1'
	]);
	const body = terrain.writes[0].body as Record<string, unknown>;
	expect(body).toMatchObject({
		title: 'Spring camp',
		organisers: ['leader-1'],
		challenge_area: 'outdoors',
		event_type: { type: 'unit', id: 'unit-1' },
		attendance: {
			leader_member_ids: ['unit-1-m0'],
			assistant_member_ids: [],
			attendee_member_ids: ['unit-1-m0', 'unit-1-m1', 'unit-1-m2'],
			participant_member_ids: ['unit-1-m1', 'unit-1-m2']
		},
		status: 'planned'
	});
	expect(terrain.writes[1].body).toMatchObject({
		status: 'concluded',
		review: {
			general_tags: [],
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

test('a unit night has no logbook step', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'record/activity/');
	// Still to come: saved as planned, with no review
	await page.getByLabel('Starts').fill('2030-03-07');
	await page.getByLabel('Ends').fill('2030-03-07');
	await expect(page.locator('.steps li')).toHaveText(['Activity', 'Who came', 'Save']);
	await page.getByLabel('Title').fill('Knots night');
	await page.getByRole('button', { name: 'Creative' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
	await page.getByRole('button', { name: /^Next/ }).click();
	await expect(page.locator('.review')).toContainText('1 participant');
	await expect(page.locator('.review')).not.toContainText('Logbook');
	await expect(page.locator('.alert-info')).toHaveCount(0);
	await page.getByRole('button', { name: 'Save to Terrain' }).click();
	await expect(page.locator('.alert-success')).toContainText(
		"as a planned activity. Conclude it in Terrain once it's over"
	);
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
	await page.getByLabel('Starts').fill('2030-03-07');
	await page.getByLabel('Ends').fill('2030-03-07');
	await page.getByLabel('Title').fill('Knots night');
	await page.getByRole('button', { name: 'Community' }).click();
	await page.getByRole('button', { name: /^Next/ }).click();
	await page.locator('.attendee', { hasText: 'Mia Brown' }).getByRole('checkbox').check();
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
