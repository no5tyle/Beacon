<!--
	Every OAS I statement with the fuller explanation Terrain gives, filtered by stream, stage, part, theme,
	where it can be done and search words. Statements can be starred, shared and printed as a checklist.
	Shown as a Beacon page, and as the installable Beacon Reference app with its filters behind a menu.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';
	import { STREAMS, streamDisplay } from '#lib/model/insights/insightsCalculator.js';
	import {
		checklistText,
		emptyReferenceLink,
		filterStatements,
		parseReferenceLink,
		PARTS,
		referenceLinkToQuery,
		stagePath,
		stageTitle,
		statementKey,
		streamOfKey,
		type OASReferenceLink,
		type OASReferenceStage,
		type OASReferenceStatement,
		type OASReferenceWhere
	} from '#lib/model/oas/reference.js';
	import { compareText, distinct, groupBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, reference, statementCounts } from '#lib/services/index.js';
	import { lacking, type StageCounts } from '#lib/services/statementCounts.js';
	import { share as shareText } from '#lib/share.js';
	import { install } from '#lib/stores/install.svelte.js';
	import { readSetting, writeSetting } from '#lib/stores/storage.js';

	let { appMode = false }: { appMode?: boolean } = $props();

	// Signed in as a leader with a unit chosen, each statement shows how many of the unit's youth have it.
	// A stage's counts load when it comes into view, and are kept only while the page is open
	const showCounts = $derived(app.isSignedIn && !app.isYouth && !!app.unitId);
	let counts = $state<Record<string, StageCounts | 'loading' | 'failed'>>({});
	// Printed, each statement can list the youth who don't have it yet. The choice is kept on the device
	const PRINT_NAMES_KEY = 'beacon-reference-print-names';
	let printNames = $state(readSetting(PRINT_NAMES_KEY) === 'true');
	$effect(() => writeSetting(PRINT_NAMES_KEY, String(printNames)));
	// Printed, each statement can have its longer explanation under it, opened or not
	const PRINT_DETAIL_KEY = 'beacon-reference-print-detail';
	let printDetail = $state(readSetting(PRINT_DETAIL_KEY) === 'true');
	$effect(() => writeSetting(PRINT_DETAIL_KEY, String(printDetail)));
	const countsKey = (stage: OASReferenceStage) => `${app.unitId}|${stagePath(stage)}`;
	const stageCounts = (stage: OASReferenceStage) => {
		const found = counts[countsKey(stage)];
		return typeof found === 'object' ? found : null;
	};

	// Each stage's count as it loads, so printing can wait for those it needs
	const counting = new SvelteMap<string, Promise<void>>();

	function loadCounts(stage: OASReferenceStage): Promise<void> {
		const key = countsKey(stage);
		if (!showCounts) return Promise.resolve();
		const loading = counting.get(key);
		if (loading && counts[key]) return loading;
		counts[key] = 'loading';
		const load = statementCounts
			.stageCounts(app.unitId, stage)
			.then((found) => void (counts[key] = found))
			.catch(() => void (counts[key] = 'failed'));
		counting.set(key, load);
		return load;
	}

	/** Counts every stage on the page, a few at a time, so a printout has them all */
	async function countAllShown() {
		const stages = groupBy(shown, (s) => s.stage.templateLink).map((g) => g.items[0].stage);
		for (let i = 0; i < stages.length; i += 4)
			await Promise.all(stages.slice(i, i + 4).map(loadCounts));
	}

	// The stages on screen, so choosing another unit can count them straight away
	const inView = new SvelteMap<HTMLElement, OASReferenceStage>();

	/** Loads a stage's counts once it scrolls into view */
	function countWhenSeen(node: HTMLElement, stage: OASReferenceStage) {
		let current = stage;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				inView.set(node, current);
				loadCounts(current);
			} else inView.delete(node);
		});
		observer.observe(node);
		return {
			update(next: OASReferenceStage) {
				current = next;
				if (inView.has(node)) inView.set(node, next);
			},
			destroy() {
				observer.disconnect();
				inView.delete(node);
			}
		};
	}

	// Choosing another unit, or signing in, while the page is open counts the stages in view afresh.
	// Only on a real change: on opening the page the stages in view are already being counted
	let countedFor = untrack(() => `${showCounts}|${app.unitId}`);
	$effect(() => {
		const now = `${showCounts}|${app.unitId}`;
		if (now === countedFor) return;
		countedFor = now;
		untrack(() => {
			counts = {};
			counting.clear();
			for (const stage of inView.values()) loadCounts(stage);
		});
	});

	const CORE_STREAMS = 'core';
	const ALL_STREAMS = 'all';
	// Showing thousands of statements at once makes the page slow, so the list is capped
	const DISPLAY_LIMIT = 300;
	// Shared with the Blazor app, which kept the same lists on this device
	const STARRED_KEY = 'topo-reference-starred';
	const OFFLINE_SAVED_KEY = 'topo-reference-offline-saved';
	const KNOWN = STREAMS.map((s) => s.key);

	let streamChoice = $state(CORE_STREAMS);
	let stages = $state<number[]>([]);
	let part = $state('');
	let theme = $state('');
	let where = $state<OASReferenceWhere>('Any');
	let search = $state('');
	let loadingMessage = $state('');
	let expanded = $state<string[]>([]);
	let filtersOpen = $state(false);
	let starred = $state<string[]>(readJson<string[]>(STARRED_KEY) ?? []);
	let starredOnly = $state(false);
	// Statements someone shared from their starred list, shown as they sent them. Not starred here unless
	// added
	let sharedList = $state<string[]>([]);
	let toast = $state('');
	let offlineSupported = $state(false);
	let online = $state(true);
	let savingOffline = $state(false);
	let offlineStatus = $state('');
	let ready = $state(false);
	// Bumped whenever more statements load, since the reference service itself isn't reactive
	let loaded = $state(0);

	function readJson<T>(key: string): T | null {
		try {
			return JSON.parse(readSetting(key) || 'null') as T | null;
		} catch {
			return null;
		}
	}

	const chosenStreams = $derived(
		streamChoice === CORE_STREAMS
			? STREAMS.filter((s) => s.isCore).map((s) => s.key)
			: streamChoice === ALL_STREAMS
				? KNOWN
				: [streamChoice]
	);

	const statements = $derived.by(() => {
		void loaded;
		return reference.statements;
	});

	// The starred list ignores the other filters, so nothing starred is hidden by mistake
	const results = $derived(
		sharedList.length > 0
			? filterStatements(statements, { keys: new Set(sharedList) })
			: starredOnly
				? filterStatements(statements, { keys: new Set(starred) })
				: filterStatements(statements, {
						streams: new Set(chosenStreams),
						stages: new Set(stages),
						part,
						theme,
						where,
						search
					})
	);
	const shown = $derived(results.slice(0, DISPLAY_LIMIT));
	const inChosenStreams = $derived(
		statements.filter((s) => chosenStreams.includes(s.stage.stream))
	);
	const themes = $derived(distinct(inChosenStreams.map((s) => s.theme)).sort(compareText));
	const stageNumbers = $derived(
		distinct(inChosenStreams.map((s) => s.stage.stage)).sort((a, b) => a - b)
	);

	// Filters set away from their defaults, shown on the app's menu button
	const activeFilterCount = $derived(
		[
			streamChoice !== CORE_STREAMS,
			stages.length > 0,
			part !== '',
			theme !== '',
			where !== 'Any'
		].filter(Boolean).length
	);

	const currentLink = $derived<OASReferenceLink>({
		stream: streamChoice === CORE_STREAMS ? '' : streamChoice,
		stages,
		part,
		theme,
		where,
		search,
		statement: '',
		starred: starredOnly && sharedList.length === 0,
		list: sharedList
	});

	// Keep the address bar matching the filters, so it can be bookmarked or shared
	$effect(() => {
		const query = referenceLinkToQuery(currentLink);
		if (ready && query !== location.search) replaceState(location.pathname + query, {});
	});

	onMount(() => {
		const link = parseReferenceLink(page.url.search);
		const shared = applyLink(link);
		(async () => {
			await loadStreams(chosenStreams);
			await loadStreams(distinct(starred.map(streamOfKey)));
			await loadStreams(distinct(sharedList.map(streamOfKey)));
			if (shared) openSharedStatement(shared);
			ready = true;
		})();

		if (!appMode) return;
		offlineSupported = !!navigator.serviceWorker?.controller;
		online = navigator.onLine;
		const saved = readJson<string>(OFFLINE_SAVED_KEY);
		if (saved) {
			const date = new Date(saved).toLocaleDateString('en-AU', {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			});
			offlineStatus = `Last saved for offline use on ${date}.`;
		}
		const update = () => (online = navigator.onLine);
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});

	/** Sets the filters from a link. Returns the shared statement's key, if the link is for one */
	function applyLink(link: OASReferenceLink): string {
		if (link.statement) {
			// A shared statement opens on its own stream and stage, expanded
			const stream = streamOfKey(link.statement);
			streamChoice = KNOWN.includes(stream) ? stream : CORE_STREAMS;
			return link.statement;
		}
		streamChoice =
			link.stream === ALL_STREAMS || KNOWN.includes(link.stream) ? link.stream : CORE_STREAMS;
		stages = link.stages;
		part = PARTS.includes(link.part) ? link.part : '';
		theme = link.theme;
		where = link.where;
		search = link.search;
		sharedList = link.list;
		starredOnly = link.starred && link.list.length === 0;
		return '';
	}

	function openSharedStatement(key: string) {
		const statement = reference.statements.find((s) => statementKey(s) === key);
		if (!statement) return;
		stages = [statement.stage.stage];
		expanded = [...expanded, key];
		requestAnimationFrame(() =>
			document.getElementById(elementId(key))?.scrollIntoView({ block: 'center' })
		);
	}

	async function loadStreams(streams: readonly string[]) {
		for (const stream of streams.filter((s) => KNOWN.includes(s) && !reference.isLoaded(s))) {
			const title = streamDisplay(stream);
			await reference.loadStream(stream, (done, total) => {
				loadingMessage = `Loading ${title}: ${done} of ${total} stages`;
			});
			loaded++;
		}
		loadingMessage = '';
	}

	function changeStream(value: string) {
		streamChoice = value || CORE_STREAMS;
		loadStreams(chosenStreams);
	}

	const elementId = (key: string) => 'st-' + key.replace(/[^A-Za-z0-9]/g, '-');

	const toggleIn = <T,>(list: T[], item: T) =>
		list.includes(item) ? list.filter((i) => i !== item) : [...list, item];

	function expandAll(open: boolean) {
		expanded = open ? distinct([...expanded, ...shown.map(statementKey)]) : [];
	}

	function clearFilters() {
		stages = [];
		part = '';
		theme = '';
		where = 'Any';
		search = '';
	}

	function toggleStar(statement: OASReferenceStatement) {
		starred = toggleIn(starred, statementKey(statement));
		writeSetting(STARRED_KEY, JSON.stringify(starred));
	}

	async function showStarred(show: boolean) {
		sharedList = [];
		starredOnly = show;
		filtersOpen = false;
		if (show) await loadStreams(distinct(starred.map(streamOfKey)));
	}

	function clearStarred() {
		if (!confirm(`Remove all ${starred.length} starred statements?`)) return;
		starred = [];
		writeSetting(STARRED_KEY, JSON.stringify(starred));
	}

	// Shared links always open the installable app
	const appUrl = (query: string) => new URL(pagePath('reference/') + query, location.href).href;

	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

	function shareStatement(statement: OASReferenceStatement) {
		const query = referenceLinkToQuery({
			...emptyReferenceLink(),
			statement: statementKey(statement)
		});
		share(`${statement.label}\n${stageTitle(statement.stage)} · ${statement.part}`, appUrl(query));
	}

	// Starred statements are only on this device, so a link to them carries the list itself
	const starredLink = () =>
		appUrl(referenceLinkToQuery({ ...emptyReferenceLink(), list: starred }));

	function shareView() {
		share(
			`${plural(results.length, 'OAS statement')} in Beacon Reference`,
			starredOnly ? starredLink() : appUrl(referenceLinkToQuery(currentLink))
		);
	}

	function shareStarred() {
		share(checklistText(results, 'Starred OAS statements, from Beacon Reference'), starredLink());
	}

	function addSharedToStarred() {
		starred = distinct([...starred, ...sharedList]);
		writeSetting(STARRED_KEY, JSON.stringify(starred));
		showToast(`${plural(sharedList.length, 'statement')} starred`);
	}

	async function share(text: string, url: string) {
		const result = await shareText('Beacon Reference', text, url);
		if (result === 'copied')
			showToast(url ? 'Link copied to the clipboard' : 'Copied to the clipboard');
		else if (result === 'failed') showToast("Sharing isn't available in this browser");
	}

	function showToast(message: string) {
		toast = message;
		setTimeout(() => {
			if (toast === message) toast = '';
		}, 2500);
	}

	async function print() {
		filtersOpen = false;
		// Signed in, the printout shows how many youth have each statement, so count every stage first
		if (showCounts) {
			showToast("Counting the unit's youth for each stage...");
			await countAllShown();
		}
		// Let the menu close before the print preview captures the page
		setTimeout(() => window.print(), 50);
	}

	// Fetch the app's own files and every template through the service worker so it keeps a copy
	async function saveForOffline() {
		savingOffline = true;
		await loadStreams(KNOWN);
		offlineStatus = 'Saving templates and app files...';
		const urls = reference.urls;
		const shell = performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.filter((name) => name.startsWith(location.origin));
		const all = distinct([new URL(pagePath('reference/'), location.href).href, ...shell, ...urls]);
		for (let i = 0; i < all.length; i += 8)
			await Promise.all(all.slice(i, i + 8).map((url) => fetch(url).catch(() => undefined)));
		let saved = 0;
		for (const url of urls) if (await caches.match(url, { ignoreSearch: true })) saved++;
		if (saved === urls.length) {
			writeSetting(OFFLINE_SAVED_KEY, JSON.stringify(new Date().toISOString()));
			offlineStatus = `All ${KNOWN.length} streams are saved for offline use.`;
		} else {
			offlineStatus = `Only ${saved} of ${urls.length} templates were saved. Try again with better signal.`;
		}
		savingOffline = false;
	}
</script>

<svelte:head>
	<title>{appMode ? 'Beacon Reference' : 'Beacon / OAS reference'}</title>
</svelte:head>

{#snippet starredButton()}
	<button
		type="button"
		class="btn btn-sm {starredOnly ? 'btn-warning' : 'btn-outline-secondary'}"
		aria-pressed={starredOnly}
		onclick={() => showStarred(!starredOnly)}>★ Starred ({starred.length})</button
	>
{/snippet}

{#snippet shareAndPrint()}
	<button type="button" class="btn btn-outline-secondary btn-sm" onclick={shareView}
		><Icon name="share-boxed" /> Share this view</button
	>
	<button type="button" class="btn btn-outline-secondary btn-sm" onclick={print}
		><Icon name="print" /> Print</button
	>
	{@render printOptions()}
{/snippet}

{#snippet printOptions()}
	<label class="print-option small">
		<input type="checkbox" class="form-check-input" bind:checked={printDetail} />
		Print the longer explanations
	</label>
	{#if showCounts}
		<label class="print-option small">
			<input type="checkbox" class="form-check-input" bind:checked={printNames} />
			Print the names of youth without each statement
		</label>
	{/if}
{/snippet}

{#snippet filterControls()}
	<div class="filters">
		<div class="field">
			<label class="form-label small" for="stream">Stream</label>
			<select
				id="stream"
				class="form-select"
				value={streamChoice}
				onchange={(e) => changeStream(e.currentTarget.value)}
			>
				<option value={CORE_STREAMS}>Core streams</option>
				<option value={ALL_STREAMS}>All streams</option>
				{#each STREAMS as stream (stream.key)}
					<option value={stream.key}>{stream.display}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label class="form-label small" for="theme">Skill theme</label>
			<select id="theme" class="form-select" bind:value={theme}>
				<option value="">All themes</option>
				{#each themes as t (t)}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label class="form-label small" for="part">Part</label>
			<select id="part" class="form-select" bind:value={part}>
				<option value="">All parts</option>
				{#each PARTS as p (p)}
					<option value={p}>{p}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label class="form-label small" for="where">Where</label>
			<select id="where" class="form-select" bind:value={where}>
				<option value="Any">Anywhere</option>
				<option value="UnitNight">Unit night</option>
				<option value="Outing">Needs an outing</option>
			</select>
		</div>
	</div>
	<div class="stages">
		<span class="form-label small"
			>Stages <span class="muted">(none selected shows every stage)</span></span
		>
		<div class="chip-group">
			{#each stageNumbers as number (number)}
				{@const on = stages.includes(number)}
				<button
					type="button"
					class="btn btn-sm {on ? 'btn-primary' : 'btn-outline-secondary'}"
					aria-pressed={on}
					onclick={() => (stages = toggleIn(stages, number))}>Stage {number}</button
				>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet resultsList()}
	{#if loadingMessage}
		<p class="muted">{loadingMessage}...</p>
	{/if}

	{#if sharedList.length > 0}
		<div class="starred-banner">
			<div class="banner-head">
				<strong>★ Shared statements</strong>
				<button type="button" class="btn btn-link btn-sm no-print" onclick={() => (sharedList = [])}
					>Back to all statements</button
				>
			</div>
			<div class="button-row no-print">
				<button type="button" class="btn btn-outline-primary btn-sm" onclick={addSharedToStarred}
					>☆ Add to my starred</button
				>
				<button type="button" class="btn btn-outline-secondary btn-sm" onclick={print}
					><Icon name="print" /> Print checklist</button
				>
			</div>
		</div>
	{:else if starredOnly}
		<div class="starred-banner">
			<div class="banner-head">
				<strong>★ Starred statements</strong>
				<button
					type="button"
					class="btn btn-link btn-sm no-print"
					onclick={() => showStarred(false)}>Back to all statements</button
				>
			</div>
			{#if starred.length > 0}
				<div class="button-row no-print">
					<button type="button" class="btn btn-outline-secondary btn-sm" onclick={print}
						><Icon name="print" /> Print checklist</button
					>
					<button type="button" class="btn btn-outline-secondary btn-sm" onclick={shareStarred}
						><Icon name="share-boxed" /> Share list</button
					>
					{@render printOptions()}
					<button type="button" class="btn btn-link btn-sm text-danger" onclick={clearStarred}
						>Clear starred</button
					>
				</div>
			{:else}
				<p class="small muted">
					Tap ☆ on any statement to add it here, for example to plan a unit night.
				</p>
			{/if}
		</div>
	{/if}

	<div class="count-row no-print">
		<span class="small muted">
			{plural(results.length, 'statement')}{results.length > shown.length
				? `, showing the first ${shown.length}. Narrow the filters to see the rest.`
				: ''}
		</span>
		{#if shown.length > 0}
			<span>
				<button type="button" class="btn btn-link btn-sm" onclick={() => expandAll(true)}
					>Expand all</button
				>
				<button type="button" class="btn btn-link btn-sm" onclick={() => expandAll(false)}
					>Collapse all</button
				>
			</span>
		{/if}
	</div>

	{#each groupBy(shown, (s) => s.stage.templateLink) as stageGroup (stageGroup.key)}
		{@const groupCounts = showCounts ? stageCounts(stageGroup.items[0].stage) : null}
		<section
			class="stage-group"
			class:as-cards={appMode}
			use:countWhenSeen={stageGroup.items[0].stage}
		>
			<h3 class="stage-title">{stageTitle(stageGroup.items[0].stage)}</h3>
			{#if groupCounts}
				<div class="count-key small muted">
					Of the {groupCounts.youth} youth in {app.unitName}: ✓ have it · ○ don't yet
				</div>
			{/if}
			<ul>
				{#each stageGroup.items as statement (statementKey(statement))}
					{@const key = statementKey(statement)}
					{@const open = expanded.includes(key)}
					{@const isStarred = starred.includes(key)}
					<!-- The whole statement opens its explanation; its text is the button for keyboards -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
					<li
						id={elementId(key)}
						class="statement"
						class:open
						onclick={() => (expanded = toggleIn(expanded, key))}
					>
						<div class="statement-row">
							<button type="button" class="statement-text" aria-expanded={open}>
								<span class="print-only">☐ </span>
								<span class="badge badge-part">{statement.part}</span>
								{statement.label}
							</button>
							<span class="statement-meta">
								{#if groupCounts}
									{@const have = Math.min(
										groupCounts.youth,
										groupCounts.completed + (groupCounts.ticked[statement.inputId] ?? 0)
									)}
									<span
										class="unit-count"
										title="{have} of {groupCounts.youth} youth have this"
										aria-label="{have} youth have this, {groupCounts.youth - have} don't yet"
										>✓ {have} · ○ {groupCounts.youth - have}</span
									>
								{/if}
								<span class="badge badge-info">{statement.theme}</span>
								<span class="badge {statement.unitNightSuitable ? 'badge-success' : 'badge-muted'}"
									>{statement.unitNightSuitable ? 'unit night' : 'outing'}</span
								>
								<span class="muted small no-print" aria-hidden="true">{open ? '▴' : '▾'}</span>
								<span class="statement-actions no-print">
									<button
										type="button"
										class="statement-action"
										class:is-starred={isStarred}
										aria-label={isStarred ? 'Remove star' : 'Star'}
										aria-pressed={isStarred}
										onclick={(e) => {
											e.stopPropagation();
											toggleStar(statement);
										}}>{isStarred ? '★' : '☆'}</button
									>
									<button
										type="button"
										class="statement-action"
										aria-label="Share"
										onclick={(e) => {
											e.stopPropagation();
											shareStatement(statement);
										}}><Icon name="share-boxed" /></button
									>
								</span>
							</span>
						</div>
						{#if groupCounts && printNames}
							{@const without = lacking(groupCounts, statement.inputId)}
							<div class="lacking-names small">
								{without.length > 0 ? `Not yet: ${without.join(', ')}` : 'Everyone has this'}
							</div>
						{/if}
						{#if open || (printDetail && statement.detail)}
							<!-- Opened on screen, or kept for the printout when the longer explanations are asked for -->
							<div class="statement-detail" class:print-only-detail={!open}>
								{#if statement.detail}
									<em>{statement.detail}</em>
								{:else}
									<em class="muted">Terrain has no further explanation for this statement.</em>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if results.length === 0 && !loadingMessage && !starredOnly && sharedList.length === 0}
		<p class="muted">No statements match these filters.</p>
	{/if}
{/snippet}

{#if appMode}
	<div class="reference-app">
		<div class="app-top">
			<header class="app-bar">
				<span class="app-title">Beacon Reference</span>
				<span class="grow"></span>
				<button
					type="button"
					class="app-menu-button"
					class:active={starredOnly}
					aria-label="Starred statements"
					aria-pressed={starredOnly}
					onclick={() => showStarred(!starredOnly)}
					>★<span class="small">{starred.length}</span></button
				>
				<button
					type="button"
					class="app-menu-button"
					aria-label="Filters"
					aria-expanded={filtersOpen}
					onclick={() => (filtersOpen = !filtersOpen)}
				>
					<span class="menu-icon" aria-hidden="true"></span>
					{#if activeFilterCount > 0}
						<span class="app-filter-count">{activeFilterCount}</span>
					{/if}
				</button>
			</header>
			{#if filtersOpen}
				<div class="app-filters">
					<div class="button-row">
						{@render starredButton()}
						{@render shareAndPrint()}
					</div>
					{@render filterControls()}
					<div class="filters-done">
						<button type="button" class="btn btn-link btn-sm" onclick={clearFilters}
							>Clear filters</button
						>
						<button
							type="button"
							class="btn btn-primary btn-sm"
							onclick={() => (filtersOpen = false)}>Done</button
						>
					</div>
					<div class="app-offline">
						<strong class="small">Offline</strong>
						{#if offlineSupported && !online}
							<p class="small muted">
								You're offline. Anything already saved still works; reconnect to save more.
							</p>
						{:else if offlineSupported}
							<p class="small muted">
								Download every stream so the reference works at camp without signal.
							</p>
							<button
								type="button"
								class="btn btn-outline-primary btn-sm"
								disabled={savingOffline}
								onclick={saveForOffline}
								><Icon name="cloud-download" />
								{savingOffline ? 'Saving...' : 'Save everything for offline'}</button
							>
						{:else}
							<p class="small muted">
								Add Beacon Reference to your home screen and open it from there to save it for
								offline use.
							</p>
						{/if}
						{#if offlineStatus}
							<p class="small">{offlineStatus}</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>
		<div class="app-search no-print">
			<input
				type="search"
				class="form-control"
				placeholder="Search statements and explanations"
				aria-label="Search"
				bind:value={search}
			/>
		</div>
		<div class="app-content">
			{@render resultsList()}
		</div>
	</div>
{:else}
	<h2>OAS reference</h2>
	<!-- The filters are for the screen; a printout is just the statements -->
	<div class="no-print">
		<p class="muted intro">
			Every Outdoor Adventure Skills I statement, with the fuller explanation Terrain gives. Click a
			statement to expand it.
			<!-- Only in a browser: inside the installed Beacon app this would open in the same window, which can't be installed -->
			{#if !install.isInstalledApp}
				<a href={pagePath('reference/')} data-sveltekit-reload>Open as the Beacon Reference app</a> to
				add it to your phone's home screen.
			{/if}
		</p>

		{@render filterControls()}
		<div class="search-row">
			<div class="field">
				<label class="form-label small" for="search">Search</label>
				<input
					id="search"
					type="search"
					class="form-control"
					placeholder="Words in the statement or its explanation, e.g. compass"
					bind:value={search}
				/>
			</div>
			<button type="button" class="btn btn-link btn-sm" onclick={clearFilters}>Clear filters</button
			>
		</div>
	</div>
	<div class="button-row no-print">
		{@render starredButton()}
		{@render shareAndPrint()}
	</div>

	{@render resultsList()}
{/if}

{#if toast}
	<div class="reference-toast" role="status">{toast}</div>
{/if}

<style>
	.intro {
		margin-bottom: 1rem;
	}

	.filters {
		display: grid;
		grid-template-columns: 3fr 4fr 2fr 3fr;
		gap: 0.5rem;
	}

	.filters .field,
	.search-row .field {
		margin-bottom: 0.5rem;
	}

	.stages {
		margin-bottom: 0.5rem;
	}

	.stages .form-label {
		display: block;
		margin-bottom: 0.25rem;
	}

	.stages .chip-group {
		gap: 0.25rem;
	}

	.search-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.search-row .field {
		flex: 1 1 20rem;
	}

	.button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 575.98px) {
		.filters {
			grid-template-columns: 1fr 1fr;
		}

		.filters .field:nth-child(-n + 2) {
			grid-column: 1 / -1;
		}
	}

	.count-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}

	.count-row .btn-link {
		min-height: 0;
		padding: 0 0.25rem;
	}

	/* Each stage is a card of statements; on phones and in the app each statement is a card of its own */
	.stage-group {
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}

	/* How many of the unit's youth have each statement, for a signed in leader */
	.count-key {
		padding: 0.35rem 1rem;
		border-bottom: 1px solid var(--border-soft);
	}

	.unit-count {
		color: var(--muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.stage-title {
		margin: 0;
		padding: 0.55rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
		font-size: 1rem;
	}

	.stage-group ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.statement {
		padding: 0.6rem 1rem;
		border-top: 1px solid var(--border-soft);
		cursor: pointer;
	}

	.statement:first-child {
		border-top: 0;
	}

	.statement.open {
		background: var(--ref-open-bg);
	}

	.statement-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.statement-text {
		flex: 1;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.badge-part {
		margin-right: 0.25rem;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		font-weight: 500;
	}

	.badge-muted {
		background: var(--faint);
	}

	.statement-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		white-space: nowrap;
	}

	.statement-actions {
		display: inline-flex;
		margin-left: auto;
	}

	.statement-action {
		min-width: 2.25rem;
		min-height: 2.25rem;
		padding: 0 0.4rem;
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 1.05rem;
		cursor: pointer;
	}

	.statement-action.is-starred {
		color: #e0a800;
	}

	.statement-detail {
		margin-top: 0.4rem;
		padding-left: 0.25rem;
		color: var(--text-2);
		font-size: 0.85rem;
		white-space: pre-line;
	}

	.stage-group.as-cards {
		border: 0;
		background: transparent;
	}

	.as-cards .stage-title {
		padding: 0.25rem 0;
		border: 0;
		background: transparent;
	}

	.as-cards .statement {
		margin-bottom: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.as-cards .statement-row {
		flex-direction: column;
	}

	.as-cards .statement-meta {
		align-self: stretch;
	}

	.as-cards .statement.open {
		border-color: var(--ref-open-border);
		background: var(--ref-open-bg);
	}

	@media (max-width: 575.98px) {
		.stage-group {
			border: 0;
			background: transparent;
		}

		.stage-title {
			padding: 0.25rem 0;
			border: 0;
			background: transparent;
		}

		.statement {
			margin-bottom: 0.5rem;
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			background: var(--surface);
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		}

		.statement:first-child {
			border-top: 1px solid var(--border);
		}

		.statement-row {
			flex-direction: column;
		}

		.statement-meta {
			align-self: stretch;
		}

		.statement.open {
			border-color: var(--ref-open-border);
		}
	}

	.starred-banner {
		margin-bottom: 1rem;
		padding: 0.75rem;
		border-left: 4px solid #ffc107;
		border-radius: 0.25rem;
		background: var(--ref-highlight);
	}

	.starred-banner p {
		margin: 0.25rem 0 0;
	}

	.banner-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.starred-banner .button-row {
		margin: 0.5rem 0 0;
	}

	/* Beacon Reference app */
	.reference-app {
		min-height: 100vh;
	}

	.app-top {
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.app-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: calc(env(safe-area-inset-top) + 0.5rem) 1rem 0.5rem;
		background-image: linear-gradient(180deg, rgb(5, 39, 103) 0%, #3a0647 70%);
		color: #fff;
	}

	.app-title {
		font-size: 1.2rem;
		font-weight: 600;
	}

	.grow {
		flex: 1;
	}

	.app-menu-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 40px;
		padding: 0.25rem 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.35);
		border-radius: var(--radius);
		background-color: rgba(255, 255, 255, 0.1);
		color: #fff;
		font: inherit;
		cursor: pointer;
	}

	.app-menu-button.active {
		background-color: rgba(255, 193, 7, 0.35);
	}

	.menu-icon {
		display: inline-block;
		width: 1.5rem;
		height: 1.5rem;
		background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28255, 255, 255, 0.85%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
		background-size: 100%;
	}

	.app-filter-count {
		position: absolute;
		top: -0.4rem;
		right: -0.4rem;
		min-width: 1.2rem;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		background: var(--warning);
		color: #212529;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.app-filters {
		max-height: calc(100vh - 5rem);
		padding: 0.75rem 1rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
		overflow-y: auto;
	}

	.app-filters .filters {
		grid-template-columns: 1fr 1fr;
	}

	.app-filters .filters .field:nth-child(-n + 2) {
		grid-column: 1 / -1;
	}

	.filters-done {
		display: flex;
		justify-content: space-between;
		margin-top: 1rem;
	}

	.app-offline {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.app-offline p {
		margin: 0.25rem 0 0.5rem;
	}

	.app-search {
		padding: 0.75rem 1rem 0.25rem;
	}

	.app-content {
		padding: 0.5rem 1rem calc(env(safe-area-inset-bottom) + 1rem);
	}

	.reference-toast {
		position: fixed;
		bottom: calc(env(safe-area-inset-bottom) + 1.5rem);
		left: 50%;
		z-index: 1100;
		padding: 0.5rem 1rem;
		border-radius: 1rem;
		background: rgba(33, 37, 41, 0.92);
		color: #fff;
		font-size: 0.9rem;
		transform: translateX(-50%);
	}

	:global(body:has(.tab-bar)) .reference-toast {
		bottom: calc(var(--tab-bar-height) + 1rem);
	}

	.print-only {
		display: none;
	}

	.print-option {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 36px;
	}

	/* A longer explanation kept only for the printout */
	.statement-detail.print-only-detail {
		display: none;
	}

	/* Who doesn't have a statement yet: only on paper */
	.lacking-names {
		display: none;
		margin: 0.15rem 0 0 1.4rem;
		color: var(--muted);
	}

	/* Printing gives a plain checklist of what's on screen */
	@media print {
		.app-top,
		.reference-toast {
			display: none !important;
		}

		.print-only {
			display: inline;
		}

		.lacking-names {
			display: block;
		}

		.statement-detail.print-only-detail {
			display: block;
			margin: 0.15rem 0 0 1.4rem;
		}

		.app-content {
			padding: 0;
		}

		.statement {
			box-shadow: none !important;
			break-inside: avoid;
		}

		.starred-banner {
			padding: 0;
			border: 0;
			background: none;
		}
	}
</style>
