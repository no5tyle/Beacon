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
	/** Other addresses it's also the current page for, e.g. Record for "record/" */
	alsoActive?: string[];
	/** A count to show beside it, e.g. approvals waiting for the leader's vote */
	badge?: number;
}

export interface NavOptions {
	/** Signed out, only Login and the Reference are offered */
	signedIn: boolean;
	/** Youth members see their own progress and the reference, not the leader pages */
	isYouth: boolean;
	/** Whether request logging is on, shown beside the version, which opens the logging page */
	logging: boolean;
	/** Submissions waiting for the leader's vote, shown on Approvals and More */
	approvalsWaiting?: number;
}

/** The main pages: tabs along the bottom on phones, the top of the sidebar on desktop */
export function mainPages({ isYouth }: NavOptions): NavPage[] {
	const pages: NavPage[] = [
		{ href: '', icon: 'home', title: 'Home', shortTitle: 'Home', exact: true }
	];
	if (!isYouth) {
		pages.push(
			{ href: 'insights/', icon: 'graph', title: 'Insights', shortTitle: 'Insights' },
			{
				href: 'oas/sign-off/',
				icon: 'check',
				title: 'Record',
				shortTitle: 'Record',
				alsoActive: ['record/']
			}
		);
	}
	pages.push(
		{ href: 'progress/', icon: 'person', title: 'Personal Progress', shortTitle: 'Progress' },
		{ href: 'oas-reference/', icon: 'book', title: 'Reference', shortTitle: 'Reference' }
	);
	return pages;
}

/** Less used pages: under More on phones, the bottom of the sidebar on desktop */
export function morePages({ isYouth, approvalsWaiting = 0 }: NavOptions): NavPage[] {
	const pages: NavPage[] = [];
	if (!isYouth)
		pages.push({
			href: 'approvals/',
			icon: 'circle-check',
			title: 'Approvals',
			shortTitle: 'Approvals',
			badge: approvalsWaiting
		});
	return [
		...pages,
		{ href: 'logout/', icon: 'account-logout', title: 'Logout', shortTitle: 'Logout' }
	];
}

/** Logging has no menu item: tapping the version opens it, as it's only needed to help solve a problem */
export const LOGGING_HREF = 'logging/';

/** Signed out: the login page and the Reference, which needs no login */
export function signedOutPages(): NavPage[] {
	return [
		{ href: 'login/', icon: 'lock-unlocked', title: 'Login', shortTitle: 'Login' },
		{ href: 'oas-reference/', icon: 'book', title: 'Reference', shortTitle: 'Reference' }
	];
}

/** Whether a page's link should show as the current one, for an address within the app (no base path) */
export function isActive(page: NavPage, path: string): boolean {
	const current = path.replace(/^\//, '').replace(/([^/])$/, '$1/');
	if (page.exact) return current === page.href;
	return [page.href, ...(page.alsoActive ?? [])].some((href) => current.startsWith(href));
}

/** The total to show on More: everything waiting under it */
export const moreBadge = (pages: readonly NavPage[]) =>
	pages.reduce((total, page) => total + (page.badge ?? 0), 0);
