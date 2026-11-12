import { install } from './stores/install.svelte.js';

/**
 * Where a signed out visitor goes from a page that needs a login. In a browser tab that's the OAS
 * Reference, which works signed out, with a banner offering the login. The installed app is for leaders
 * and youth who use Beacon, so it goes straight to the login, as does a login Terrain stopped renewing
 * (the login page says why)
 */
export function signedOutHome(sessionExpired: boolean): string {
	return install.isInstalledApp || sessionExpired ? 'login/' : 'oas-reference/';
}
