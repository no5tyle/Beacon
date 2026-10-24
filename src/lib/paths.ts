import { resolve } from '$app/paths';

/**
 * The full address of a page within Beacon, adding the base path the site is served from,
 * e.g. "insights/" → "/beacon-next/insights/". Use it for every link to a page.
 */
export function pagePath(path: string): string {
	return resolve('/') + path;
}
