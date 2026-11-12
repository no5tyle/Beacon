// "Keep me signed in": a login kept on the device, encrypted, so reloading Beacon doesn't sign out
import { expect, test, type Page } from '@playwright/test';
import { fakeTerrain, type FakeTerrain } from './terrain.js';

async function logIn(page: Page, keep: boolean) {
	await page.goto('login/');
	await page.selectOption('#branch', 'sa');
	await page.locator('#memberNumber').pressSequentially('1234567');
	await page.locator('#password').pressSequentially('secret');
	if (keep) await page.getByLabel(/Keep me signed in on this device/).check();
	await page.click('#logIn');
	await expect(page).toHaveURL(/\/insights\/$/);
}

const refreshes = (terrain: FakeTerrain) =>
	terrain.requests.filter((r) => r.startsWith('POST cognito-idp')).length;

test('a kept login signs back in after a reload, with only an encrypted token kept', async ({
	page
}) => {
	const terrain = await fakeTerrain(page);
	await logIn(page, true);
	const before = refreshes(terrain);
	await page.reload();
	await expect(page).toHaveURL(/\/insights\/$/);
	await expect(page.locator('h2').first()).toBeVisible();
	await expect(page.locator('#logIn')).toHaveCount(0);
	// Renewed from the kept token: a login request, but no password typed
	expect(refreshes(terrain)).toBeGreaterThan(before);

	// What's kept: no token in plain sight in local storage, and an encrypted record
	const kept = await page.evaluate(async () => {
		const all = JSON.stringify({ ...localStorage });
		const record = await new Promise<unknown>((resolve) => {
			const open = indexedDB.open('beacon-login');
			open.onsuccess = () => {
				const get = open.result.transaction('login').objectStore('login').get('saved');
				get.onsuccess = () => resolve(get.result);
			};
		});
		const r = record as { data: ArrayBuffer; key: CryptoKey };
		return {
			local: all,
			plain: new TextDecoder().decode(r.data),
			extractable: r.key.extractable
		};
	});
	expect(kept.local).not.toContain('"r"');
	expect(kept.plain).not.toContain('refreshToken');
	expect(kept.extractable).toBe(false);
});

test('without the box ticked, a reload signs out, back to the Reference in a browser', async ({
	page
}) => {
	await fakeTerrain(page);
	await logIn(page, false);
	await expect(page.locator('.keep-prompt'), 'a browser tab is not asked').toHaveCount(0);
	await page.reload();
	await expect(page).toHaveURL(/\/oas-reference\/$/);
});

test('Logout forgets a kept login', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page, true);
	await page.goto('logout/');
	await expect(page).toHaveURL(/\/oas-reference\/$/);
	await page.reload();
	await expect(page).toHaveURL(/\/oas-reference\/$/);
	await page.goto('login/');
	await expect(page.locator('#keepSignedIn')).not.toBeChecked();
});

test.describe('the installed app', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() =>
			Object.defineProperty(navigator, 'standalone', { get: () => true })
		);
	});

	test('without the box ticked, asks once whether to stay signed in, and keeps it on yes', async ({
		page
	}) => {
		await fakeTerrain(page);
		await logIn(page, false);
		const prompt = page.locator('.keep-prompt');
		await expect(prompt).toContainText('Stay signed in on this device?');
		await prompt.getByRole('button', { name: 'Stay signed in' }).click();
		await expect(prompt).toHaveCount(0);
		await page.reload();
		await expect(page).toHaveURL(/\/insights\/$/);
		await expect(page.locator('#logIn')).toHaveCount(0);
		await expect(page.locator('.keep-prompt'), 'not asked again').toHaveCount(0);
	});

	test('Not now leaves the login unkept, so the next open asks for the login', async ({ page }) => {
		await fakeTerrain(page);
		await logIn(page, false);
		await page.locator('.keep-prompt').getByRole('button', { name: 'Not now' }).click();
		await expect(page.locator('.keep-prompt')).toHaveCount(0);
		await page.reload();
		await expect(page).toHaveURL(/\/login\/$/);
	});

	test('with the box ticked, nothing is asked', async ({ page }) => {
		await fakeTerrain(page);
		await logIn(page, true);
		await expect(page.locator('h2').first()).toBeVisible();
		await expect(page.locator('.keep-prompt')).toHaveCount(0);
	});
});

test('a kept login Terrain won’t renew is forgotten, and asks to log in again', async ({
	page
}) => {
	await fakeTerrain(page, { refuseRefresh: true });
	await logIn(page, true);
	await page.reload();
	await expect(page).toHaveURL(/\/login\/$/);
	await expect(page.locator('.alert-info')).toContainText('Your Terrain login expired');
	expect(await page.evaluate(() => localStorage.getItem('beacon-keep-signed-in'))).toBeNull();
});

test('the info button beside Keep me signed in explains the stored refresh token', async ({
	page
}) => {
	await fakeTerrain(page);
	await page.goto('login/');
	const info = page.getByRole('button', { name: 'About keeping you signed in' });
	await expect(page.locator('#keepInfo')).toHaveCount(0);
	await info.click();
	await expect(info).toHaveAttribute('aria-expanded', 'true');
	await expect(page.locator('#keepInfo')).toContainText('stores a refresh token from Terrain');
	await expect(page.locator('#keepInfo')).toContainText('Consider that before ticking it');
	// It explains; it doesn't tick the box
	await expect(page.locator('#keepSignedIn')).not.toBeChecked();
	await info.click();
	await expect(page.locator('#keepInfo')).toHaveCount(0);
});
