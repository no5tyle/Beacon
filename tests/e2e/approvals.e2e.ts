import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn, navigate } from './terrain.js';

test('lists what is waiting for the Unit Council, with who has voted', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	await expect(page.locator('h2')).toHaveText('Approvals');
	await expect(page.locator('.summary')).toHaveText(
		'Mt Example Scouts · 4 waiting for the Unit Council'
	);
	await expect(page.locator('.group-heading')).toHaveText([
		'Adventure Sport (1)',
		'Intro To Section (1)',
		'Milestone 1 (1)',
		'OAS Camping 1 (1)'
	]);
	const milestone = page.locator('.approval-card', { hasText: 'Liam Smith' });
	await expect(milestone).toContainText('Review · submitted 3 days ago');
	await expect(milestone).toContainText('1 of 2 approved (Kim Leader)');
	await expect(milestone.getByRole('button', { name: 'Approve' })).toBeVisible();
	// Already voted on, or not this leader's to action: no button
	const voted = page.locator('.approval-card', { hasText: 'Ava Nguyen' });
	await expect(voted).toContainText("You've voted on this one.");
	await expect(voted.getByRole('button', { name: 'Approve' })).toHaveCount(0);
	await expect(
		page
			.locator('.approval-card', { hasText: 'Noah Jones' })
			.getByRole('button', { name: 'Approve' })
	).toHaveCount(0);

	// Filtered by youth, and grouped by youth instead
	await page.getByRole('button', { name: 'Mia Brown' }).click();
	await expect(page.locator('.approval-card')).toHaveCount(1);
	await page.getByRole('button', { name: 'Everyone' }).click();
	await page.selectOption('#groupBy', 'member');
	await expect(page.locator('.group-heading').first()).toHaveText('Ava Nguyen (1)');
});

test('approves after confirming, sending what Terrain’s Approvals tab sends', async ({ page }) => {
	const terrain = await fakeTerrain(page);
	await logIn(page);
	await navigate(page, 'approvals/');
	const card = page.locator('.approval-card', { hasText: 'Mia Brown' });
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
	const card = page.locator('.approval-card', { hasText: 'Liam Smith' });
	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(page.locator('.alert-success')).toHaveText('Approved Milestone 1 for Liam Smith.');
	await expect(page.locator('.approval-card', { hasText: 'Liam Smith' })).toHaveCount(0);
	await expect(page.locator('.summary')).toHaveText(
		'Mt Example Scouts · 3 waiting for the Unit Council'
	);
});

test('youth members don’t see Approvals', async ({ page, isMobile }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	if (isMobile) await page.getByRole('button', { name: 'More' }).click();
	await expect(page.getByRole('link', { name: 'Approvals' })).toHaveCount(0);
});

test('a badge on More and Approvals shows what waits for the leader’s vote', async ({
	page,
	isMobile
}) => {
	await fakeTerrain(page);
	await logIn(page);
	// Liam's milestone and Mia's camping: Ava's is voted on already, and Noah's isn't this leader's
	if (isMobile) {
		const more = page.getByRole('button', { name: 'More, 2 waiting' });
		await expect(more.locator('.tab-badge')).toHaveText('2');
		await more.click();
		await expect(
			page.locator('.more-item', { hasText: 'Approvals' }).locator('.nav-badge')
		).toHaveText(/^2/);
		await page.locator('.more-item', { hasText: 'Approvals' }).click();
	} else {
		await expect(
			page.locator('.side-link', { hasText: 'Approvals' }).locator('.nav-badge')
		).toHaveText(/^2/);
		await navigate(page, 'approvals/');
	}

	const card = page.locator('.approval-card', { hasText: 'Mia Brown' });
	await card.getByRole('button', { name: 'Approve' }).click();
	await card.getByRole('button', { name: 'Yes, approve' }).click();
	await expect(card).toContainText("You've voted on this one.");
	if (isMobile) await expect(page.locator('.tab-badge')).toHaveText('1');
	else
		await expect(
			page.locator('.side-link', { hasText: 'Approvals' }).locator('.nav-badge')
		).toHaveText(/^1/);
});

test('no badge when nothing waits for the leader', async ({ page }) => {
	await fakeTerrain(page, { youth: true });
	await logIn(page);
	await expect(page.locator('.tab-badge, .nav-badge')).toHaveCount(0);
});
