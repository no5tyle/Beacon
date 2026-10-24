<!--
	Beacon's navigation: a sidebar on desktop, and on phones a tab bar along the bottom (within thumb
	reach) with the less used pages under More.
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';
	import {
		isActive,
		mainPages,
		morePages,
		signedOutPages,
		type NavOptions,
		type NavPage
	} from '#lib/navigation.js';
	import { pagePath } from '#lib/paths.js';

	let { options, version }: { options: NavOptions; version: string } = $props();

	let moreOpen = $state(false);
	const main = $derived(options.signedIn ? mainPages(options) : []);
	const more = $derived(options.signedIn ? morePages(options) : []);
	const sidebar = $derived(options.signedIn ? [...main, ...more] : signedOutPages());
	// The current address within the app, without the base path
	const path = $derived(page.url.pathname.slice(pagePath('').length - 1));
	const onMorePage = $derived(more.some((item) => isActive(item, path)));

	const href = (item: NavPage) => pagePath(item.href);

	// Close the menu after moving to another page
	$effect(() => {
		void page.url.pathname;
		moreOpen = false;
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (moreOpen = false)} />

<aside class="sidebar no-print">
	<a class="brand" href={pagePath('')}>
		<img src={asset('beacon-64.png')} width="22" height="22" alt="" />
		Beacon
	</a>
	<nav aria-label="Main">
		{#each sidebar as item (item.href)}
			<a class="side-link" class:active={isActive(item, path)} href={href(item)}>
				<Icon name={item.icon} />
				{item.title}
			</a>
		{/each}
		<span class="side-version">Version {version}</span>
	</nav>
</aside>

{#if !options.signedIn}
	<header class="top-bar no-print">
		<a class="brand" href={pagePath('')}>
			<img src={asset('beacon-64.png')} width="22" height="22" alt="" />
			Beacon
		</a>
		<a
			class="top-action"
			class:active={path.startsWith('/oas-reference')}
			href={pagePath('oas-reference/')}
		>
			<Icon name="book" /> Reference
		</a>
	</header>
{/if}

{#if moreOpen}
	<button class="more-backdrop" aria-label="Close menu" onclick={() => (moreOpen = false)}></button>
	<div class="more-menu" role="menu">
		{#each more as item (item.href)}
			<a class="more-item" class:active={isActive(item, path)} role="menuitem" href={href(item)}>
				<Icon name={item.icon} />
				{item.title}
			</a>
		{/each}
		<div class="more-version">Beacon version {version}</div>
	</div>
{/if}

{#if options.signedIn}
	<nav class="tab-bar no-print" aria-label="Main">
		{#each main as item (item.href)}
			<a class="tab" class:active={isActive(item, path)} href={href(item)}>
				<Icon name={item.icon} />
				<span class="tab-label">{item.shortTitle}</span>
			</a>
		{/each}
		<button
			type="button"
			class="tab"
			class:active={moreOpen || onMorePage}
			aria-haspopup="menu"
			aria-expanded={moreOpen}
			onclick={() => (moreOpen = !moreOpen)}
		>
			<Icon name="ellipses" />
			<span class="tab-label">More</span>
		</button>
	</nav>
{/if}

<style>
	/* Desktop sidebar */
	.sidebar {
		display: none;
	}

	@media (min-width: 641px) {
		.sidebar {
			position: sticky;
			top: 0;
			display: flex;
			flex-direction: column;
			flex-shrink: 0;
			width: 250px;
			height: 100vh;
			overflow-y: auto;
			background-image: linear-gradient(180deg, var(--brand) 0%, var(--brand-deep) 95%);
		}
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 3.5rem;
		padding: 0 1.5rem;
		background: rgba(0, 0, 0, 0.4);
		color: #fff;
		font-size: 1.1rem;
		text-decoration: none;
	}

	.brand img {
		border-radius: 0.25rem;
	}

	nav[aria-label='Main']:not(.tab-bar) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
	}

	.side-link,
	.side-version {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 3rem;
		padding: 0 0.75rem;
		border-radius: 4px;
		color: #d7d7d7;
		font-size: 0.9rem;
		text-decoration: none;
	}

	.side-link :global(.icon) {
		font-size: 1.1rem;
	}

	.side-link:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.side-link.active {
		background: rgba(255, 255, 255, 0.25);
		color: #fff;
	}

	.side-version {
		color: rgba(255, 255, 255, 0.45);
	}

	/* Phone header when signed out: Beacon and a way to the Reference */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 3.5rem;
		padding-right: 0.75rem;
		background-image: linear-gradient(180deg, var(--brand) 0%, var(--brand-deep) 95%);
	}

	.top-bar .brand {
		background: none;
	}

	.top-action {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 0.5rem;
		color: #d7d7d7;
		font-size: 0.9rem;
		text-decoration: none;
	}

	.top-action.active,
	.top-action:hover {
		color: #fff;
	}

	@media (min-width: 641px) {
		.top-bar {
			display: none;
		}
	}

	/* Phone tab bar */
	.tab-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		display: flex;
		height: var(--tab-bar-height);
		padding: 0 max(env(safe-area-inset-right), 0.75rem) var(--tab-bar-bottom)
			max(env(safe-area-inset-left), 0.75rem);
		background: var(--tab-bar-bg);
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
	}

	.tab {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--tab-bar-text);
		font: inherit;
		font-size: 0.7rem;
		text-decoration: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.tab :global(.icon) {
		font-size: 1.25rem;
	}

	.tab.active {
		color: #fff;
		box-shadow: inset 0 3px 0 var(--accent);
	}

	.tab-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Six tabs on the narrowest phones: shrink the labels so none get cut off */
	@media (max-width: 359.98px) {
		.tab {
			font-size: 0.62rem;
		}
	}

	/* Menu of less used pages that opens above the More tab */
	.more-backdrop {
		position: fixed;
		inset: 0;
		z-index: 21;
		border: 0;
		background: rgba(0, 0, 0, 0.25);
	}

	.more-menu {
		position: fixed;
		right: 0.5rem;
		bottom: calc(var(--tab-bar-height) + 0.5rem);
		z-index: 22;
		min-width: 13rem;
		padding: 0.35rem 0;
		border-radius: 0.6rem;
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.more-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 48px;
		padding: 0 1rem;
		color: var(--text);
		text-decoration: none;
	}

	.more-item :global(.icon) {
		color: var(--muted);
	}

	.more-item.active {
		color: var(--brand-text);
		font-weight: 600;
	}

	.more-version {
		padding: 0.4rem 1rem 0.3rem;
		border-top: 1px solid var(--border-soft);
		color: var(--faint);
		font-size: 0.75rem;
	}

	@media (min-width: 641px) {
		.tab-bar,
		.more-backdrop,
		.more-menu {
			display: none;
		}
	}
</style>
