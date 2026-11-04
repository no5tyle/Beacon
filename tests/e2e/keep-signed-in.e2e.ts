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

test('without the box ticked, a reload goes back to the login', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page, false);
	await page.reload();
	await expect(page).toHaveURL(/\/login\/$/);
});

test('Logout forgets a kept login', async ({ page }) => {
	await fakeTerrain(page);
	await logIn(page, true);
	await page.goto('logout/');
	await expect(page).toHaveURL(/\/login\/$/);
	await page.reload();
	await expect(page).toHaveURL(/\/login\/$/);
	await expect(page.locator('#keepSignedIn')).not.toBeChecked();
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
