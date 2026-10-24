<script lang="ts">
	import '#lib/styles/theme.css';
	import '#lib/styles/base.css';
	import { asset } from '$app/paths';
	import { pagePath } from '#lib/paths.js';
	import { page } from '$app/state';
	import AppNav from '#lib/components/AppNav.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Beacon Reference installs as its own app from /reference/, with its own name and icon
	const isReferenceApp = $derived(page.url.pathname.startsWith(pagePath('reference/')));
	const appName = $derived(isReferenceApp ? 'Beacon Reference' : 'Beacon');
	const iconDir = $derived(isReferenceApp ? 'reference/' : '');

	// Phase 0: the shell shows a signed-in leader's navigation; sign in arrives in Phase 3
	const navOptions = { isYouth: false, logging: false };
</script>

<svelte:head>
	<link rel="manifest" href={asset(`${iconDir}manifest.webmanifest`)} />
	<link rel="apple-touch-icon" href={asset(`${iconDir}apple-touch-icon.png`)} />
	<meta name="apple-mobile-web-app-title" content={appName} />
</svelte:head>

<div class="page">
	<AppNav options={navOptions} version={__BEACON_VERSION__} />
	<main>
		{@render children()}
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
		main {
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
