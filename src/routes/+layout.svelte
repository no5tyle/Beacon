<script lang="ts">
	import '#lib/styles/theme.css';
	import '#lib/styles/base.css';
	import { untrack } from 'svelte';
	import { asset } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppNav from '#lib/components/AppNav.svelte';
	import InstallHint from '#lib/components/InstallHint.svelte';
	import { pagePath } from '#lib/paths.js';
	import { app, approvalsBadge, preload, readyToSubmit } from '#lib/services/index.js';
	import { unitsKey } from '#lib/stores/approvals.svelte.js';
	import { VERSION } from '#lib/stores/app.svelte.js';
	import { requestLog } from '#lib/stores/log.svelte.js';
	import '#lib/stores/install.svelte.js';
	import { removeOldYouthData } from '#lib/stores/storage.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Beacon keeps nothing about youth members on the device; clear anything an older version left behind
	removeOldYouthData();

	// The current address within the app, without the base path
	const path = $derived(page.url.pathname.slice(pagePath('').length - 1));

	// Pages that work signed out: the login, the Reference (and its installable app) and the style guide
	const PUBLIC = ['/login/', '/oas-reference/', '/reference/', '/styles/'];
	const isPublic = $derived(PUBLIC.some((p) => path.startsWith(p)));
	// The page Beacon opens at, which also suggests adding it to the Home Screen
	const onLanding = $derived(app.isYouth ? path.startsWith('/progress/') : path === '/insights/');

	// Youth in the chosen unit see only their own progress, Record for SIAs, the Reference, and Approvals
	// on the Unit Council. Anywhere else, including after switching to a unit they're youth in, goes to
	// their own progress
	const YOUTH_PAGES = [
		'/record/sia-plan/',
		'/oas-reference/',
		'/reference/',
		'/styles/',
		'/info/',
		'/logging/',
		'/logout/',
		'/login/'
	];
	const youthMayView = (at: string) =>
		YOUTH_PAGES.some((p) => at.startsWith(p)) ||
		at.startsWith(`/progress/${app.memberId}/`) ||
		(app.onUnitCouncil && at.startsWith('/approvals/'));
	$effect(() => {
		if (app.isSignedIn && app.isYouth && app.memberId && !youthMayView(path))
			goto(pagePath(`progress/${app.memberId}/`), { replaceState: true });
	});

	// Beacon Reference installs as its own app from /reference/, with its own name and icon
	const isReferenceApp = $derived(path.startsWith('/reference/'));
	const appName = $derived(isReferenceApp ? 'Beacon Reference' : 'Beacon');
	const iconDir = $derived(isReferenceApp ? 'reference/' : '');

	// A login kept on this device ("Keep me signed in") signs back in as Beacon opens
	if (app.resuming) void app.resume();

	// Signed out, every other page is the login page. Replacing the history entry keeps Back from bouncing back
	$effect(() => {
		if (!app.isSignedIn && !app.resuming && !isPublic)
			goto(pagePath('login/'), { replaceState: true });
	});

	// Start loading the unit's progress in the background once a leader is signed in with a unit chosen
	$effect(() => {
		void [app.isSignedIn, app.unitId, path];
		preload.startIfReady();
	});

	// What's on Approvals' tabs, for the badge on More and Approvals: the approvals list, and what's ready
	// to submit, found in the background once the unit's progress loads (checked again on each page, as
	// a save elsewhere means finding it again)
	$effect(() => {
		void path;
		if (!app.isSignedIn || !app.profiles || app.chosenUnits.length === 0) return;
		if (!app.isYouth || app.onUnitCouncil) approvalsBadge.loadIfNeeded(app.chosenUnits);
		if (!app.isYouth) untrack(() => readyToSubmit.loadIfNeeded(app.unitId));
	});

	const navOptions = $derived({
		signedIn: app.isSignedIn,
		isYouth: app.isYouth,
		onUnitCouncil: app.onUnitCouncil,
		memberId: app.memberId,
		logging: requestLog.enabled,
		approvalsWaiting: approvalsBadge.count(unitsKey(app.chosenUnits), readyToSubmit)
	});
</script>

<svelte:head>
	<link rel="manifest" href={asset(`${iconDir}manifest.webmanifest`)} />
	<link rel="apple-touch-icon" href={asset(`${iconDir}apple-touch-icon.png`)} />
	<meta name="apple-mobile-web-app-title" content={appName} />
</svelte:head>

{#if isReferenceApp}
	<!-- Beacon Reference is an app of its own: just the reference, with its own bar and no Beacon pages -->
	{@render children()}
{:else}
	<div class="page">
		<AppNav options={navOptions} version={VERSION} />
		<main>
			{#if app.resuming && !isPublic}
				<p class="muted resuming" role="status">Signing you back in to Terrain...</p>
			{:else if app.isSignedIn || isPublic}
				{#if app.isSignedIn && onLanding}<InstallHint />{/if}
				{@render children()}
			{/if}
		</main>
	</div>
{/if}

<style>
	.resuming {
		margin-top: 2rem;
		text-align: center;
	}

	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	main {
		flex: 1;
		min-width: 0;
		padding: 1.1rem 1.25rem 1.5rem;
	}

	/* Keep the end of each page clear of the tab bar */
	@media (max-width: 640.98px) {
		.page:has(:global(.tab-bar)) main {
			padding-bottom: calc(var(--tab-bar-height) + 1rem);
		}
	}

	@media (min-width: 641px) {
		.page {
			flex-direction: row;
		}

		/* Centred in the space beside the sidebar, so wide screens don't leave it all on the left */
		main {
			max-width: 1140px;
			margin-inline: auto;
			padding: 1.5rem 1.5rem 2rem 2rem;
		}
	}
</style>
