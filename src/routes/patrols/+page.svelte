<!--
	Patrols: the unit's youth by patrol, leaders first, with how far each is towards their award and when
	they move up, and a summary for each patrol. Each youth opens their progress details.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import { today } from '#lib/model/dates.js';
	import { moveUpBadge } from '#lib/model/insights/insightsCalculator.js';
	import { rulesFor } from '#lib/model/insights/settings.js';
	import { youthSummaries, type YouthSummary } from '#lib/model/insights/youthSummary.js';
	import { asc, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, members, unitProgress } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import { readInsightsSettings } from '#lib/stores/storage.js';

	const NO_PATROL = 'No patrol';

	let youth = $state<MemberSummary[]>([]);
	let loading = $state(false);
	let message = $state('');
	// Award progress, once the unit's progress is loaded (by Insights, or in the background)
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
		if (unitId === app.unitId) loaded = youthSummaries(all, rules);
	}

	$effect(() => {
		loaded = {};
		if (app.unitId) loadSummaries(app.unitId);
	});

	onMount(() => unitProgress.onProgress(() => app.unitId && loadSummaries(app.unitId)));

	async function load(unitId: string) {
		loading = true;
		message = '';
		try {
			const found = await members.youth(unitId);
			if (unitId === app.unitId) youth = found;
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

	async function refresh() {
		if (loading || !app.unitId) return;
		members.clear(app.unitId);
		await load(app.unitId);
	}

	// Each patrol in name order, youth without one last; within a patrol its leader, assistant, then the rest
	const patrols = $derived(
		sortBy(
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
		)
	);

	const average = (items: MemberSummary[]) => {
		const known = items.map((m) => loaded[m.id]?.percent).filter((p) => p !== undefined);
		return known.length > 0 ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null;
	};
	const movingUp = (items: MemberSummary[]) =>
		items.filter((m) => {
			const badge = moveUpBadge(m.dateOfBirth, rules, settings, now);
			return badge !== null && badge.urgency !== 'None';
		}).length;
</script>

<svelte:head>
	<title>Beacon / Patrols</title>
</svelte:head>

<div use:pullToRefresh={refresh}>
	<h2>Patrols{app.unitName ? ` (${app.unitName})` : ''}</h2>

	{#if !app.unitId}
		<ChooseUnit />
	{/if}

	{#if message}
		<div class="alert alert-danger">{message}</div>
	{/if}

	{#if loading && youth.length === 0}
		<p class="muted">Loading youth...</p>
	{:else if youth.length > 0}
		{#each patrols as patrol (patrol.key)}
			{@const avg = average(patrol.items)}
			{@const leaving = movingUp(patrol.items)}
			<section class="patrol" aria-label={patrol.key}>
				<div class="patrol-head">
					<h3>{patrol.key}</h3>
					<span class="muted small">{patrol.items.length} youth</span>
				</div>
				{#if avg !== null || leaving > 0}
					<div class="small muted summary">
						{[
							avg !== null ? `${rules.peakAwardName} average ${avg}%` : '',
							leaving > 0 ? `${leaving} moving up within ${settings.moveUpWindowMonths} months` : ''
						]
							.filter(Boolean)
							.join(' · ')}
					</div>
				{/if}
				<div class="card list">
					{#each patrol.items as member (member.id)}
						{@const moveUp = moveUpBadge(member.dateOfBirth, rules, settings, now)}
						<a class="row row-link member" href={pagePath(`progress/${member.id}/`)}>
							<span class="row-main">
								{member.firstName}
								{members.lastName(member)}
								{#if member.patrolDuty}<span class="badge badge-plain duty"
										>{member.patrolDuty}</span
									>{/if}
							</span>
							<span class="row-value">
								{#if loaded[member.id]}<span class="muted percent"
										>{loaded[member.id].percent}%</span
									>{/if}
								{#if moveUp && moveUp.urgency !== 'None'}
									<span class="badge move-up {badgeClass[moveUp.urgency]}">{moveUp.text}</span>
								{/if}
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	{:else if app.unitId && !loading}
		<p class="muted">No youth found in this unit.</p>
	{/if}
</div>

<style>
	.patrol + .patrol {
		margin-top: 1.5rem;
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

	.patrol .card {
		margin-top: 0.5rem;
	}

	/* Rows as in the phone's own settings, as a youth's progress shows them: hairlines between */
	.list {
		padding-top: 0;
		padding-bottom: 0;
	}

	.list > * + * {
		border-top: 0.5px solid var(--border);
	}

	.row {
		min-height: 44px;
		padding: 0.55rem 0;
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.member {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		color: inherit;
		text-decoration: none;
	}

	.row-value {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.duty {
		margin-left: 0.3rem;
		font-size: 0.7rem;
		vertical-align: 0.1em;
	}

	.move-up {
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.badge-plain {
		background: var(--surface-2);
		color: var(--muted);
	}

	.percent {
		font-variant-numeric: tabular-nums;
	}
</style>
