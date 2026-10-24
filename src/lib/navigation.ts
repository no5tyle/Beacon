import type { IconName } from './icons.js';

export interface NavPage {
	/** Address within the app, without the base path or a leading slash, e.g. "insights/" */
	href: string;
	icon: IconName;
	/** Name in the desktop sidebar and the More menu */
	title: string;
	/** Name under the icon in the phone tab bar */
	shortTitle: string;
	/** Only active on exactly this address, rather than anything under it */
	exact?: boolean;
}

export interface NavOptions {
	/** Youth members see their own progress and the reference, not the leader pages */
	isYouth: boolean;
	/** Whether request logging is on, which changes the logging item's name */
	logging: boolean;
}

/** The main pages: tabs along the bottom on phones, the top of the sidebar on desktop */
export function mainPages({ isYouth }: NavOptions): NavPage[] {
	const pages: NavPage[] = [
		{ href: '', icon: 'home', title: 'Home', shortTitle: 'Home', exact: true }
	];
	if (!isYouth) {
		pages.push(
			{ href: 'insights/', icon: 'graph', title: 'Insights', shortTitle: 'Insights' },
			{ href: 'oas/sign-off/', icon: 'check', title: 'Record OAS', shortTitle: 'Record' }
		);
	}
	pages.push(
		{ href: 'progress/', icon: 'person', title: 'Personal Progress', shortTitle: 'Progress' },
		{ href: 'oas-reference/', icon: 'book', title: 'Reference', shortTitle: 'Reference' }
	);
	return pages;
}

/** Less used pages: under More on phones, the bottom of the sidebar on desktop */
export function morePages({ logging }: NavOptions): NavPage[] {
	return [
		{
			href: 'logging/',
			icon: 'document',
			title: logging ? 'Stop logging' : 'Turn on logging',
			shortTitle: 'Logging'
		},
		{ href: 'logout/', icon: 'account-logout', title: 'Logout', shortTitle: 'Logout' }
	];
}

/** Whether a page's link should show as the current one, for an address within the app (no base path) */
export function isActive(page: NavPage, path: string): boolean {
	const current = path.replace(/^\//, '').replace(/([^/])$/, '$1/');
	return page.exact ? current === page.href : current.startsWith(page.href);
}
