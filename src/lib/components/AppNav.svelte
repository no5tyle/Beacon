<!--
	Beacon's navigation: on desktop a bar across the top with the app's name and a sidebar of pages below
	it, the same frame as the Program Builder, with Info and Logout in a profile menu at its top right; on
	phones a tab bar along the bottom (within thumb reach) with the less used pages, Info and Logout under
	More.
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';
	import UnitPicker from './UnitPicker.svelte';
	import {
		isActive,
		LOGGING_HREF,
		mainPages,
		moreBadge,
		morePages,
		phoneTabs,
		profilePages,
		signedOutPages,
		type NavOptions,
		type NavPage
	} from '#lib/navigation.js';
	import { pagePath } from '#lib/paths.js';

	let {
		options,
		version,
		name = '',
		unit = ''
	}: {
		options: NavOptions;
		version: string;
		/** The signed in member's name and the chosen unit, at the top of the profile menu */
		name?: string;
		unit?: string;
	} = $props();

	let moreOpen = $state(false);
	let profileOpen = $state(false);
	const profile = profilePages();
	// Up to two letters for the profile button: "Ava Nguyen" is AN
	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.map((part) => part[0].toUpperCase())
			.filter((_, i, all) => i === 0 || i === all.length - 1)
			.join('')
	);
	// Read after a badge's count. Kept with its space in a string: as plain text the space is trimmed, and a
	// screen reader hears "2waiting"
	const WAITING = ' waiting for you';
	// The current address within the app, without the base path
	const path = $derived(page.url.pathname.slice(pagePath('').length - 1));
	const sidebar = $derived(
		options.signedIn ? [...mainPages(options), ...morePages(options)] : signedOutPages()
	);
	// Signed out, the tabs are just Login and the Reference, with no More
	const tabs = $derived(
		options.signedIn ? phoneTabs(options, path) : { main: signedOutPages(), more: [] }
	);
	const main = $derived(tabs.main);
	const more = $derived(tabs.more);
	const onLogging = $derived(path.startsWith(`/${LOGGING_HREF}`));
	const onMorePage = $derived(onLogging || more.some((item) => isActive(item, path)));
	const versionText = $derived(options.logging ? ' · logging on' : '');
	const moreCount = $derived(moreBadge(more));

	const href = (item: NavPage) => (item.external ? item.href : pagePath(item.href));
	// Another website opens in a new tab, leaving Beacon open where it was
	const target = (item: NavPage) => (item.external ? '_blank' : undefined);
	const rel = (item: NavPage) => (item.external ? 'noopener' : undefined);

	// Close the menus after moving to another page, and bring the tabs back
	$effect(() => {
		void page.url.pathname;
		moreOpen = false;
		profileOpen = false;
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
		if (moreOpen || y < MINIMIZE_AFTER || !options.signedIn) {
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

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') moreOpen = profileOpen = false;
	}}
	onscroll={onScroll}
/>

<header class="appbar no-print">
	<a class="brand" href={pagePath('')}>
		<img src={asset('beacon-64.png')} width="36" height="36" alt="" />
		<span class="brand-text">
			<span class="brand-title">Beacon</span>
			<span class="brand-sub">OAS, progress and insights from Terrain</span>
		</span>
	</a>
	{#if options.signedIn}
		<div class="profile">
			<button
				type="button"
				class="profile-button"
				aria-haspopup="true"
				aria-expanded={profileOpen}
				aria-label={name ? `Profile: ${name}` : 'Profile'}
				onclick={() => (profileOpen = !profileOpen)}
			>
				<span class="avatar" aria-hidden="true">
					{#if initials}{initials}{:else}<Icon name="person" />{/if}
				</span>
				{#if name}<span class="profile-name">{name}</span>{/if}
			</button>
			{#if profileOpen}
				<button
					class="profile-backdrop"
					aria-label="Close menu"
					onclick={() => (profileOpen = false)}
				></button>
				<div class="profile-menu" role="menu">
					{#if name || unit}
						<div class="profile-who">
							{#if name}<strong>{name}</strong>{/if}
							{#if unit}<span>{unit}</span>{/if}
						</div>
					{/if}
					{#each profile as item (item.href)}
						<a
							class="profile-item"
							class:active={isActive(item, path)}
							role="menuitem"
							href={pagePath(item.href)}
						>
							<Icon name={item.icon} />
							{item.title}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</header>

<aside class="sidebar no-print">
	{#if options.signedIn}
		<div class="side-picker"><UnitPicker idPrefix="side-" /></div>
	{/if}
	<nav aria-label="Main">
		{#each sidebar as item (item.href)}
			<a
				class="side-link"
				class:active={isActive(item, path)}
				href={href(item)}
				target={target(item)}
				rel={rel(item)}
			>
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

{#if moreOpen}
	<button class="more-backdrop" aria-label="Close menu" onclick={() => (moreOpen = false)}></button>
	<div class="more-menu glass">
		<UnitPicker idPrefix="menu-" />
		{#each more as item (item.href)}
			<a
				class="more-item"
				class:active={isActive(item, path)}
				href={href(item)}
				target={target(item)}
				rel={rel(item)}
				onclick={() => item.external && (moreOpen = false)}
			>
				<Icon name={item.icon} />
				{item.title}
				{@render badge(item)}
			</a>
		{/each}
		<a
			class="more-version"
			class:active={onLogging}
			href={pagePath(LOGGING_HREF)}
			title="Logging, to help solve a problem">Beacon version {version}{versionText}</a
		>
	</div>
{/if}

<nav
	class="tab-bar glass no-print"
	class:minimized
	class:compact={!options.signedIn}
	aria-label="Main"
>
	{#each main as item (item.href)}
		<a
			class="tab"
			class:active={isActive(item, path) && !moreOpen}
			class:current={isActive(item, path) && !onMorePage}
			href={href(item)}
			aria-label={item.badge ? `${item.shortTitle}, ${item.badge} waiting` : undefined}
			onclick={expandOnTap}
		>
			<span class="tab-icon">
				<Icon name={item.icon} />
				{#if item.badge}<span class="badge tab-badge" aria-hidden="true">{item.badge}</span>{/if}
			</span>
			<span class="tab-label">{item.shortTitle}</span>
		</a>
	{/each}
	{#if options.signedIn}
		<button
			type="button"
			class="tab"
			class:active={moreOpen || onMorePage}
			class:current={onMorePage || !main.some((item) => isActive(item, path))}
			aria-haspopup="true"
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
	{/if}
</nav>

<style>
	/* Desktop: a see-through bar across the top with the app's name, and a sidebar of pages below it */
	.appbar,
	.sidebar {
		display: none;
	}

	@media (min-width: 641px) {
		.appbar {
			position: sticky;
			top: 0;
			z-index: 20;
			grid-column: 1 / -1;
			display: flex;
			align-items: center;
			height: var(--appbar-height);
			padding: 0 1.25rem;
			border-bottom: 0.5px solid var(--border);
			background: var(--bar-bg);
			-webkit-backdrop-filter: var(--bar-filter);
			backdrop-filter: var(--bar-filter);
		}

		.sidebar {
			position: sticky;
			top: var(--appbar-height);
			display: flex;
			flex-direction: column;
			width: 250px;
			height: calc(100vh - var(--appbar-height));
			overflow-y: auto;
			border-right: 0.5px solid var(--border);
			background: var(--bg);
		}
	}

	.appbar {
		justify-content: space-between;
	}

	/* Profile menu, at the top right */
	.profile {
		position: relative;
	}

	.profile-button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		height: 2.5rem;
		padding: 0 0.85rem 0 0.25rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.profile-button:hover,
	.profile-button[aria-expanded='true'] {
		background: var(--hover);
	}

	.profile-button:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--tint);
		color: #fff;
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.profile-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.profile-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 2;
		width: 15rem;
		padding: 0.4rem;
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow:
			var(--shadow),
			0 0 0 0.5px var(--border);
		transform-origin: top right;
		animation: menu-in 0.2s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.profile-who {
		display: flex;
		flex-direction: column;
		margin-bottom: 0.3rem;
		padding: 0.5rem 0.85rem 0.6rem;
		border-bottom: 0.5px solid var(--border);
		line-height: 1.3;
	}

	.profile-who span {
		color: var(--muted);
		font-size: 0.8125rem;
	}

	.profile-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		padding: 0 0.85rem;
		border-radius: var(--radius);
		color: var(--text);
		text-decoration: none;
	}

	.profile-item:hover {
		background: var(--hover);
	}

	.profile-item :global(.icon) {
		color: var(--tint);
	}

	.profile-item.active {
		color: var(--tint);
		font-weight: 600;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--text);
		text-decoration: none;
	}

	.brand img {
		border-radius: 10px;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}

	.brand-title {
		font-size: 1.0625rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.brand-sub {
		color: var(--muted);
		font-size: 0.75rem;
	}

	nav[aria-label='Main']:not(.tab-bar) {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.75rem;
	}

	.side-link,
	.side-version {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		padding: 0 0.85rem;
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9375rem;
		font-weight: 500;
		text-decoration: none;
		transition: background-color 0.15s;
	}

	.side-link :global(.icon) {
		color: var(--tint);
		font-size: 1.1rem;
	}

	.side-link:hover {
		background: var(--hover);
	}

	.side-link.active {
		background: var(--tint-fill);
		color: var(--tint);
		font-weight: 600;
	}

	.side-link:focus-visible,
	.side-version:focus-visible,
	.brand:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}

	/* The version sits at the foot of the sidebar */
	.side-version {
		margin-top: auto;
		min-height: 2.25rem;
		color: var(--faint);
		font-size: 0.75rem;
		font-weight: 400;
	}

	a.side-version:hover,
	a.side-version.active {
		color: var(--muted);
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

	/* Signed out there are only two tabs, so the pill is narrower, in the middle */
	.tab-bar.compact {
		left: 50%;
		right: auto;
		width: min(16rem, calc(100% - 1.5rem));
		transform: translateX(-50%);
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
		width: min(17rem, calc(100vw - 1.5rem));
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
		.more-menu,
		.profile-menu {
			transition: none;
			animation: none;
		}
	}

	/* The group and unit, above the pages, when there's a choice to make */
	.more-menu :global(.unit-picker) {
		margin-bottom: 0.4rem;
		padding: 0.5rem 0.6rem 0.75rem;
		border-bottom: 0.5px solid var(--border);
	}

	/* The group and unit, in a card at the top of the sidebar */
	.side-picker :global(.unit-picker) {
		margin: 0.75rem 0.75rem 0;
		padding: 0.75rem 0.85rem 0.85rem;
		border-radius: var(--radius-lg);
		background: var(--surface);
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
