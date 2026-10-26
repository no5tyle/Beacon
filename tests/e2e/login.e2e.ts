import { expect, test } from '@playwright/test';
import { fakeTerrain, logIn } from './terrain.js';

test('signed out, Beacon opens at the login', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('');
	await expect(page).toHaveURL(/\/login\/$/);
	await expect(page.locator('h2')).toHaveText('Log in to Beacon');
});

test('logs in and remembers the branch, but nothing else', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page, 'nsw');
	await expect(page).toHaveURL(/\/insights\/$/);

	const stored = await page.evaluate(() => ({ ...localStorage }));
	expect(stored.LoginBranch).toBe('nsw');
	expect(JSON.stringify(stored), 'no password or tokens kept').not.toMatch(
		/secret|"i"|AccessToken/
	);

	await page.goto('login/');
	await expect(page.locator('#branch')).toHaveValue('nsw');
	await expect(
		page.locator('#memberNumber'),
		'the cursor goes to the first empty field'
	).toBeFocused();
});

test('shows why Terrain refused the login', async ({ page }) => {
	await fakeTerrain(page, { refuseLogin: 'Incorrect username or password.' });
	await page.goto('login/');
	await page.selectOption('#branch', 'sa');
	await page.locator('#memberNumber').pressSequentially('1');
	await page.locator('#password').pressSequentially('wrong');
	await page.click('#logIn');
	await expect(page.locator('.alert-danger')).toHaveText('Incorrect username or password.');
	await expect(page).toHaveURL(/\/login\/$/);
});

test('asks for the branch first', async ({ page }) => {
	await fakeTerrain(page);
	await page.goto('login/');
	await page.click('#logIn');
	await expect(page.locator('.alert-danger')).toHaveText('Select your branch.');
});

test.describe('password manager fills', () => {
	const fills = {
		'a normal fill': async (page: import('@playwright/test').Page) => {
			await page.fill('#memberNumber', '1234567');
			await page.fill('#password', 'secret12');
		},
		'an iOS QuickType fill': async (page: import('@playwright/test').Page) =>
			page.evaluate(() => {
				for (const [id, value] of [
					['memberNumber', '1234567'],
					['password', 'secret12']
				]) {
					const field = document.getElementById(id) as HTMLInputElement;
					field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true }));
					field.value = value;
					field.dispatchEvent(
						new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' })
					);
				}
			}),
		'a fill with no events': async (page: import('@playwright/test').Page) =>
			page.evaluate(() => {
				(document.getElementById('memberNumber') as HTMLInputElement).value = '1234567';
				(document.getElementById('password') as HTMLInputElement).value = 'secret12';
			})
	};

	for (const [name, fill] of Object.entries(fills)) {
		test(`logs in straight away after ${name}`, async ({ page }) => {
			await fakeTerrain(page);
			await page.goto('login/');
			await page.selectOption('#branch', 'sa');
			await fill(page);
			await expect(page).toHaveURL(/\/insights\/$/);
		});
	}

	test('waits for Log In when the password is typed', async ({ page }) => {
		await fakeTerrain(page);
		await page.goto('login/');
		await page.selectOption('#branch', 'sa');
		await page.locator('#memberNumber').pressSequentially('1234567');
		await page.locator('#password').pressSequentially('secret12', { delay: 0 });
		await page.waitForTimeout(1200);
		await expect(page).toHaveURL(/\/login\/$/);

		await page.click('.version');
		await expect(
			page.locator('.diagnostics'),
			'troubleshooting shows events, never values'
		).toContainText('password keydown');
		await expect(page.locator('.diagnostics')).not.toContainText('secret');
	});
});
