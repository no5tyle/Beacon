<!--
	Youth: the unit's youth, by patrol (leaders first, with each patrol's average award progress and who's
	moving up), by name, or by who moves up soonest. Each opens their progress details. Patrols was its own
	page; it's now this page's grouping.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import YouthLoadProgress from '#lib/components/YouthLoadProgress.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import { asc, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { today } from '#lib/model/dates.js';
	import { moveUpBadge } from '#lib/model/insights/insightsCalculator.js';
	import { youthSummaries, type YouthSummary } from '#lib/model/insights/youthSummary.js';
	import { rulesFor } from '#lib/model/insights/settings.js';
	import { app, members, unitProgress } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import {
		readInsightsSettings,
		readSetting,
		writeSetting,
		YOUTH_GROUP_KEY
	} from '#lib/stores/storage.js';

	const NO_PATROL = 'No patrol';
	type Grouping = 'patrol' | 'name' | 'moving-up';
	const GROUPINGS: { value: Grouping; label: string }[] = [
		{ value: 'patrol', label: 'Patrol' },
		{ value: 'name', label: 'Name' },
		{ value: 'moving-up', label: 'Moving up' }
	];

	let youth = $state<MemberSummary[]>([]);
	let loading = $state(false);
	let message = $state('');
	// Remembered on this device; by patrol unless another was chosen
	const saved = readSetting(YOUTH_GROUP_KEY);
	let grouping = $state<Grouping>(
		GROUPINGS.some((g) => g.value === saved) ? (saved as Grouping) : 'patrol'
	);
	// Each youth's award progress and logbook, once the unit's progress is loaded (by Insights, or in the
	// background). Nothing is loaded just for this
	let loaded = $state<Record<string, YouthSummary>>({});
	const settings = readInsightsSettings();
	const now = today();
	const rules = $derived(rulesFor(settings, app.section));
	const badgeClass = { High: '', Medium: 'badge-warning', Low: 'badge-info', None: 'badge-plain' };

	async function loadSummaries(unitId: string) {
		const load = unitProgress.loadProgress(unitId);
		const finished = load.total > 0 && load.done === load.total;
		if (!unitProgress.isCached(unitId) && !finished) return;
		const all = await unitProgress.get(unitId);
		if (unitId !== app.unitId) return;
		loaded = youthSummaries(all, rules);
	}

	$effect(() => {
		loaded = {};
		if (app.unitId) loadSummaries(app.unitId);
	});

	// The background load may finish while the list is open
	onMount(() => unitProgress.onProgress(() => app.unitId && loadSummaries(app.unitId)));

	async function load(unitId: string) {
		loading = true;
		message = '';
		try {
			const found = await members.youth(unitId);
			if (unitId !== app.unitId) return;
			youth = sortBy(
				found,
				asc((m) => m.firstName),
				asc((m) => m.lastName)
			);
		} catch {
			message = "Couldn't load the unit's youth from Terrain.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		youth = [];
		if (app.unitId) load(app.unitId);
	});

	// Pull to refresh: fetch the unit's youth from Terrain again
	async function refresh() {
		if (loading || !app.unitId) return;
		members.clear(app.unitId);
		await load(app.unitId);
	}

	function choose(value: Grouping) {
		grouping = value;
		writeSetting(YOUTH_GROUP_KEY, value);
	}

	const moveUp = (m: MemberSummary) => moveUpBadge(m.dateOfBirth, rules, settings, now);
	const movingSoon = (m: MemberSummary) => {
		const badge = moveUp(m);
		return badge !== null && badge.urgency !== 'None';
	};

	// The sections to show: each patrol in name order, youth without one last, leaders first within it;
	// or everyone in one list, by name or by date of birth (oldest, so moving up soonest, first)
	const sections = $derived.by(() => {
		if (grouping === 'patrol')
			return sortBy(
				groupBy(
					sortBy(
						youth,
						asc((m) => m.patrolOrder),
						asc((m) => m.firstName),
						asc((m) => m.lastName)
					),
					(m) => m.patrolName || NO_PATROL
				),
				asc((g) => g.key === NO_PATROL),
				asc((g) => g.key)
			);
		if (grouping === 'moving-up')
			return [
				{
					key: '',
					items: sortBy(
						youth,
						asc((m) => m.dateOfBirth === null),
						asc((m) => m.dateOfBirth ?? ''),
						asc((m) => m.firstName)
					)
				}
			];
		return [{ key: '', items: youth }];
	});

	const average = (items: MemberSummary[]) => {
		const known = items.map((m) => loaded[m.id]?.percent).filter((p) => p !== undefined);
		return known.length > 0 ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null;
	};
</script>

<svelte:head>
	<title>Beacon / Youth</title>
</svelte:head>

<div use:pullToRefresh={refresh}>
	<div class="page-head">
		<div>
			<h2>Youth</h2>
			{#if app.unitName}<div class="small muted unit-line">
					{app.unitName}{youth.length > 0 ? ` · ${youth.length} youth` : ''}
				</div>{/if}
		</div>
		{#if youth.length > 0}
			<a class="btn btn-outline-primary btn-sm" href={pagePath('progress/report/')}
				><Icon name="print" /> Reports</a
			>
		{/if}
	</div>

	{#if app.unitId}<YouthLoadProgress
			unitId={app.unitId}
			label="Loading award progress for youth"
		/>{/if}

	{#if !app.unitId}
		<ChooseUnit />
	{/if}

	{#if message}
		<div class="alert alert-danger">{message}</div>
	{/if}

	{#if loading && youth.length === 0}
		<p class="muted">Loading youth...</p>
	{:else if youth.length > 0}
		<div class="group-by" role="group" aria-label="Group by">
			<span class="small muted">Group by</span>
			{#each GROUPINGS as g (g.value)}
				<button
					type="button"
					class="btn chip {grouping === g.value ? 'btn-primary' : 'btn-outline-primary'}"
					aria-pressed={grouping === g.value}
					onclick={() => choose(g.value)}>{g.label}</button
				>
			{/each}
		</div>

		{#each sections as section (section.key)}
			{@const avg = section.key ? average(section.items) : null}
			{@const leaving = section.key ? section.items.filter(movingSoon).length : 0}
			<section class="patrol" aria-label={section.key || 'Youth'}>
				{#if section.key}
					<div class="patrol-head">
						<h3>{section.key}</h3>
						<span class="muted small">{section.items.length} youth</span>
					</div>
					{#if avg !== null || leaving > 0}
						<div class="small muted summary">
							{[
								avg !== null ? `${rules.peakAwardName} average ${avg}%` : '',
								leaving > 0
									? `${leaving} moving up within ${settings.moveUpWindowMonths} months`
									: ''
							]
								.filter(Boolean)
								.join(' · ')}
						</div>
					{/if}
				{/if}
				<div class="card list">
					{#each section.items as member (member.id)}
						{@const badge = moveUp(member)}
						{@const summary = loaded[member.id]}
						<!-- A grid shared by every row, so the bars, percentages, nights and km line up down the page:
						     the name above its bar, then fixed columns for the numbers, then the chevron -->
						<a class="row-link youth" href={pagePath(`progress/${member.id}/`)}>
							<span class="name">
								<span class="strong">{member.firstName} {members.lastName(member)}</span>
								{#if member.patrolDuty}<span class="badge badge-plain duty"
										>{member.patrolDuty}</span
									>{/if}
								{#if member.unitCouncil}<span
										class="badge badge-plain council"
										title="On the Unit Council">UC</span
									>{/if}
								{#if grouping !== 'patrol' && member.patrolName}<span
										class="small muted patrol-name">{member.patrolName}</span
									>{/if}
							</span>
							{#if badge}
								<span class="badge move-up {badgeClass[badge.urgency]}">{badge.text}</span>
							{/if}
							{#if summary}
								<!-- The patrol's summary names the award -->
								<span class="award small muted">
									<span class="award-track" aria-hidden="true">
										<span style:width="{summary.percent}%"></span>
									</span>
									<span class="percent" title="{rules.peakAwardName} {summary.percent}%"
										><span class="visually-hidden">{`${rules.peakAwardName} `}</span
										>{summary.percent}%</span
									>
									<span class="logbook">
										<span
											class="nights"
											title="Nights camped"
											aria-label="{summary.nights} nights camped"
											><span aria-hidden="true">⛺</span> {summary.nights}</span
										>
										<span class="kms" title="Kilometres hiked" aria-label="{summary.kms} km hiked"
											><span aria-hidden="true">🥾</span> {summary.kms} km</span
										>
									</span>
								</span>
							{/if}
							<span class="chevron" aria-hidden="true">&rsaquo;</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.page-head h2 {
		margin-bottom: 0.1rem;
	}

	.unit-line {
		margin-bottom: 0.75rem;
	}

	.page-head .btn {
		flex-shrink: 0;
		margin-top: 0.4rem;
	}

	.group-by {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	.patrol + .patrol {
		margin-top: 1.25rem;
	}

	.patrol-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.patrol-head h3 {
		margin: 0;
	}

	.summary {
		margin: 0.15rem 0 0.5rem;
	}

	/* Rows as in the phone's own settings, with hairlines between */
	.list {
		padding-top: 0;
		padding-bottom: 0;
	}

	.list > * + * {
		border-top: 0.5px solid var(--border);
	}

	/* Name and move up on the first line; bar, percentage, nights and km on the second, each number in
	   a column of its own width so they line up in every row; the chevron to the right of both */
	.youth {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.8rem 2.8rem 4.4rem 1rem;
		grid-template-areas:
			'name name move move chevron'
			'bar percent nights kms chevron';
		align-items: center;
		column-gap: 0.5rem;
		row-gap: 0.35rem;
		min-height: 44px;
		padding: 0.6rem 0;
		color: inherit;
		text-decoration: none;
	}

	.name {
		grid-area: name;
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}

	.duty,
	.council {
		font-size: 0.7rem;
	}

	/* Kept on one line, at the end of the numbers' columns */
	.move-up {
		grid-area: move;
		justify-self: end;
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.badge-plain {
		background: var(--surface-2);
		color: var(--muted);
	}

	/* The award line's parts take their own places in the row's grid */
	.award,
	.logbook {
		display: contents;
		font-variant-numeric: tabular-nums;
	}

	.award-track {
		grid-area: bar;
		height: 5px;
		border-radius: 3px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.award-track span {
		display: block;
		height: 100%;
		border-radius: 3px;
		background: var(--success);
	}

	.percent,
	.nights,
	.kms {
		text-align: right;
		white-space: nowrap;
	}

	.percent {
		grid-area: percent;
	}

	.nights {
		grid-area: nights;
	}

	.kms {
		grid-area: kms;
	}

	.chevron {
		grid-area: chevron;
		justify-self: end;
		color: var(--muted);
		font-size: 1.4rem;
	}
</style>
