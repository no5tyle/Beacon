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
		LOGGING_HREF,
		mainPages,
		moreBadge,
		morePages,
		signedOutPages,
		type NavOptions,
		type NavPage
	} from '#lib/navigation.js';
	import { pagePath } from '#lib/paths.js';

	let { options, version }: { options: NavOptions; version: string } = $props();

	let moreOpen = $state(false);
	// Read after a badge's count. Kept with its space in a string: as plain text the space is trimmed, and a
	// screen reader hears "2waiting"
	const WAITING = ' waiting for you';
	const main = $derived(options.signedIn ? mainPages(options) : []);
	const more = $derived(options.signedIn ? morePages(options) : []);
	const sidebar = $derived(options.signedIn ? [...main, ...more] : signedOutPages());
	// The current address within the app, without the base path
	const path = $derived(page.url.pathname.slice(pagePath('').length - 1));
	const onLogging = $derived(path.startsWith(`/${LOGGING_HREF}`));
	const onMorePage = $derived(onLogging || more.some((item) => isActive(item, path)));
	const versionText = $derived(options.logging ? ' · logging on' : '');
	const moreCount = $derived(moreBadge(more));

	const href = (item: NavPage) => pagePath(item.href);

	// Close the menu after moving to another page, and bring the tabs back
	$effect(() => {
		void page.url.pathname;
		moreOpen = false;
		minimized = false;
	});

	/*
		As in iOS, the tabs shrink out of the way while the leader scrolls down through a page and come
		back when they scroll up, reach the top, or tap the shrunk tab. The page's action bar moves up
		beside them while they're shrunk, so it's marked on the page too.
	*/
	let minimized = $state(false);
	const MINIMIZE_AFTER = 60;
	// How far a scroll has to go in one direction before the tabs change: a short way down to shrink, and
	// further up to come back, so small movements and a finger resting on the page leave them be
	const SHRINK_RUN = 24;
	const EXPAND_RUN = 64;
	let lastY = 0;
	// Where the current run in one direction started
	let runFrom = 0;

	function onScroll() {
		const max = document.documentElement.scrollHeight - window.innerHeight;
		// The page bouncing past its top or bottom isn't the leader scrolling, so it counts as staying put
		const y = Math.min(Math.max(window.scrollY, 0), max);
		if (moreOpen || y < MINIMIZE_AFTER) {
			if (y < MINIMIZE_AFTER) minimized = false;
			lastY = runFrom = y;
			return;
		}
		if ((y - lastY) * (lastY - runFrom) < 0) runFrom = lastY;
		lastY = y;
		const run = y - runFrom;
		if (run > SHRINK_RUN) minimized = true;
		else if (run < -EXPAND_RUN) minimized = false;
	}

	// A tap on the shrunk bar only brings it back. Returns whether the tap should go on to act
	function expandOnTap(event: Event): boolean {
		if (!minimized) return true;
		event.preventDefault();
		minimized = false;
		return false;
	}

	$effect(() => {
		const root = document.documentElement;
		if (minimized) root.dataset.tabsMinimized = '';
		else delete root.dataset.tabsMinimized;
		return () => delete root.dataset.tabsMinimized;
	});
</script>

{#snippet badge(item: NavPage)}
	{#if item.badge}
		<span class="badge nav-badge">{item.badge}<span class="visually-hidden">{WAITING}</span></span>
	{/if}
{/snippet}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (moreOpen = false)} onscroll={onScroll} />

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
				{@render badge(item)}
			</a>
		{/each}
		{#if options.signedIn}
			<a
				class="side-version"
				class:active={onLogging}
				href={pagePath(LOGGING_HREF)}
				title="Logging, to help solve a problem">Version {version}{versionText}</a
			>
		{:else}
			<span class="side-version">Version {version}</span>
		{/if}
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
	<div class="more-menu glass" role="menu">
		{#each more as item (item.href)}
			<a class="more-item" class:active={isActive(item, path)} role="menuitem" href={href(item)}>
				<Icon name={item.icon} />
				{item.title}
				{@render badge(item)}
			</a>
		{/each}
		<a
			class="more-version"
			class:active={onLogging}
			role="menuitem"
			href={pagePath(LOGGING_HREF)}
			title="Logging, to help solve a problem">Beacon version {version}{versionText}</a
		>
	</div>
{/if}

{#if options.signedIn}
	<nav class="tab-bar glass no-print" class:minimized aria-label="Main">
		{#each main as item (item.href)}
			<a
				class="tab"
				class:active={isActive(item, path) && !moreOpen}
				class:current={isActive(item, path) && !onMorePage}
				href={href(item)}
				onclick={expandOnTap}
			>
				<Icon name={item.icon} />
				<span class="tab-label">{item.shortTitle}</span>
			</a>
		{/each}
		<button
			type="button"
			class="tab"
			class:active={moreOpen || onMorePage}
			class:current={onMorePage || !main.some((item) => isActive(item, path))}
			aria-haspopup="menu"
			aria-expanded={moreOpen}
			aria-label={moreCount > 0 ? `More, ${moreCount} waiting` : undefined}
			onclick={(e) => {
				if (expandOnTap(e)) moreOpen = !moreOpen;
			}}
		>
			<span class="tab-icon">
				<Icon name="ellipses" />
				{#if moreCount > 0}<span class="badge tab-badge" aria-hidden="true">{moreCount}</span>{/if}
			</span>
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

	a.side-version:hover,
	a.side-version.active {
		color: rgba(255, 255, 255, 0.8);
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

	/* Phone tab bar: a glass pill floating above the bottom of the screen */
	.tab-bar {
		position: fixed;
		left: max(env(safe-area-inset-left), 0.75rem);
		right: max(env(safe-area-inset-right), 0.75rem);
		bottom: var(--tab-bar-bottom);
		z-index: 20;
		display: flex;
		gap: 0.15rem;
		height: var(--tab-bar-pill);
		padding: 0.25rem;
		border-radius: 999px;
		transition:
			right var(--glass-motion),
			width var(--glass-motion);
	}

	/* Scrolled down: the bar shrinks to a circle holding only the current tab, out of the content's way,
	   and comes back on scrolling up or tapping it */
	.tab-bar.minimized {
		gap: 0;
		right: calc(100% - max(env(safe-area-inset-left), 0.75rem) - var(--tab-bar-pill));
	}

	/* Clipped only while folding away: otherwise the More tab's count sits over its edge */
	.tab-bar.minimized .tab:not(.current) {
		overflow: hidden;
		flex: 0 0 0;
		opacity: 0;
		pointer-events: none;
	}

	.tab-bar.minimized .tab-label {
		max-height: 0;
		opacity: 0;
	}

	.tab {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--glass-text);
		font: inherit;
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		text-decoration: none;
		transition:
			flex-grow var(--glass-motion),
			flex-basis var(--glass-motion),
			opacity 0.2s ease,
			background-color 0.2s ease;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.tab :global(.icon) {
		font-size: 1.375rem;
	}

	/* The current tab sits in a lens of its own, its icon and name in the app's tint */
	.tab.active {
		background: var(--glass-active-bg);
		color: var(--glass-active-text);
	}

	.tab:active {
		transform: scale(0.94);
	}

	/* The More tab's count sits on the corner of its icon */
	.tab-icon {
		position: relative;
		display: inline-flex;
	}

	.tab-badge {
		position: absolute;
		top: -0.45rem;
		left: 0.85rem;
		font-size: 0.65rem;
		box-shadow: 0 0 0 2px var(--surface);
	}

	/* A count beside a page's name in the sidebar and the More menu, pushed to the right */
	.nav-badge {
		margin-left: auto;
	}

	.tab-label {
		max-height: 1rem;
		transition:
			max-height var(--glass-motion),
			opacity 0.2s ease;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Six tabs on the narrowest phones: shrink the labels so none get cut off */
	@media (max-width: 359.98px) {
		.tab {
			font-size: 0.58rem;
		}
	}

	/* Menu of less used pages that opens above the More tab */
	.more-backdrop {
		position: fixed;
		inset: 0;
		z-index: 21;
		border: 0;
		background: transparent;
	}

	.more-menu {
		position: fixed;
		right: max(env(safe-area-inset-right), 0.75rem);
		bottom: calc(var(--tab-bar-height) + 0.5rem);
		z-index: 22;
		min-width: 13rem;
		padding: 0.4rem;
		overflow: hidden;
		border-radius: 1.75rem;
		transform-origin: bottom right;
		animation: menu-in 0.28s cubic-bezier(0.32, 0.72, 0, 1);
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tab-bar,
		.tab,
		.more-menu {
			transition: none;
			animation: none;
		}
	}

	.more-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 44px;
		padding: 0 0.85rem;
		border-radius: 1.35rem;
		color: var(--glass-text);
		text-decoration: none;
	}

	.more-item:hover {
		background: var(--glass-active-bg);
	}

	.more-item :global(.icon) {
		color: var(--muted);
	}

	.more-item.active {
		color: var(--tint);
		font-weight: 600;
	}

	.more-item.active :global(.icon) {
		color: var(--tint);
	}

	.more-version {
		display: block;
		margin-top: 0.25rem;
		padding: 0.5rem 0.85rem 0.3rem;
		border-top: 0.5px solid var(--border);
		color: var(--faint);
		font-size: 0.75rem;
		text-decoration: none;
	}

	.more-version.active {
		color: var(--brand-text);
	}

	@media (min-width: 641px) {
		.tab-bar,
		.more-backdrop,
		.more-menu {
			display: none;
		}
	}
</style>
