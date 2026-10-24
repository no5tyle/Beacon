<script lang="ts">
	import '#lib/styles/theme.css';
	import '#lib/styles/base.css';
	import { asset } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppNav from '#lib/components/AppNav.svelte';
	import { pagePath } from '#lib/paths.js';
	import { app, preload } from '#lib/services/index.js';
	import { VERSION } from '#lib/stores/app.svelte.js';
	import { requestLog } from '#lib/stores/log.svelte.js';
	import '#lib/stores/install.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The current address within the app, without the base path
	const path = $derived(page.url.pathname.slice(pagePath('').length - 1));

	// Pages that work signed out: the login, the Reference (and its installable app) and the style guide
	const PUBLIC = ['/login/', '/oas-reference/', '/reference/', '/styles/'];
	const isPublic = $derived(PUBLIC.some((p) => path.startsWith(p)));

	// Beacon Reference installs as its own app from /reference/, with its own name and icon
	const isReferenceApp = $derived(path.startsWith('/reference/'));
	const appName = $derived(isReferenceApp ? 'Beacon Reference' : 'Beacon');
	const iconDir = $derived(isReferenceApp ? 'reference/' : '');

	// Signed out, every other page is the login page. Replacing the history entry keeps Back from bouncing back
	$effect(() => {
		if (!app.isSignedIn && !isPublic) goto(pagePath('login/'), { replaceState: true });
	});

	// Start loading the unit's progress in the background once a leader is signed in with a unit chosen
	$effect(() => {
		void [app.isSignedIn, app.unitId, path];
		preload.startIfReady();
	});

	const navOptions = $derived({
		signedIn: app.isSignedIn,
		isYouth: app.isYouth,
		logging: requestLog.enabled
	});
</script>

<svelte:head>
	<link rel="manifest" href={asset(`${iconDir}manifest.webmanifest`)} />
	<link rel="apple-touch-icon" href={asset(`${iconDir}apple-touch-icon.png`)} />
	<meta name="apple-mobile-web-app-title" content={appName} />
</svelte:head>

<div class="page">
	<AppNav options={navOptions} version={VERSION} />
	<main>
		{#if app.isSignedIn || isPublic}
			{@render children()}
		{/if}
	</main>
</div>

<style>
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

		main {
			max-width: 1140px;
			padding: 1.5rem 1.5rem 2rem 2rem;
		}
	}
</style>
