<!-- Progress: the unit's youth, each opening their progress details -->
<script lang="ts">
	import { onMount } from 'svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import { asc, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { peakAwardBreakdown } from '#lib/model/insights/insightsCalculator.js';
	import { rulesFor } from '#lib/model/insights/settings.js';
	import { app, members, unitProgress } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import { readInsightsSettings } from '#lib/stores/storage.js';

	let youth = $state<MemberSummary[]>([]);
	let loading = $state(false);
	let message = $state('');
	// Each youth's award progress, once the unit's progress is loaded (by Insights, or in the background).
	// Nothing is loaded just for this
	let percents = $state<Record<string, number>>({});
	const rules = $derived(rulesFor(readInsightsSettings(), app.section));

	async function loadPercents(unitId: string) {
		const loaded = unitProgress.loadProgress(unitId);
		const finished = loaded.total > 0 && loaded.done === loaded.total;
		if (!unitProgress.isCached(unitId) && !finished) return;
		const all = await unitProgress.get(unitId);
		if (unitId !== app.unitId) return;
		percents = Object.fromEntries(
			all.map((p) => [
				p.memberId,
				Math.round(peakAwardBreakdown(p, rules).reduce((total, c) => total + c.earned, 0))
			])
		);
	}

	$effect(() => {
		percents = {};
		if (app.unitId) loadPercents(app.unitId);
	});

	// The background load may finish while the list is open
	onMount(() => unitProgress.onProgress(() => app.unitId && loadPercents(app.unitId)));

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
</script>

<svelte:head>
	<title>Beacon / Progress</title>
</svelte:head>

<div use:pullToRefresh={refresh}>
	<h2>Progress{app.unitName ? ` (${app.unitName})` : ''}</h2>

	{#if !app.unitId}
		<ChooseUnit />
	{/if}

	{#if message}
		<div class="alert alert-danger">{message}</div>
	{/if}

	{#if loading && youth.length === 0}
		<p class="muted">Loading youth...</p>
	{:else if youth.length > 0}
		<ul class="row-list">
			{#each youth as member (member.id)}
				<li>
					<a class="card row-link youth" href={pagePath(`progress/${member.id}/`)}>
						<div class="grow">
							<div class="strong">{member.firstName} {members.lastName(member)}</div>
							{#if percents[member.id] !== undefined}
								<div class="award">
									<span class="award-track"><span style:width="{percents[member.id]}%"></span></span
									>
									<span class="small muted">{rules.peakAwardName} {percents[member.id]}%</span>
								</div>
							{/if}
							<dl>
								<div>
									<dt>Member Number</dt>
									<dd>{member.memberNumber}</dd>
								</div>
								{#if member.patrolName}
									<div>
										<dt>Patrol</dt>
										<dd>{member.patrolName}</dd>
									</div>
								{/if}
								{#if member.patrolDuty}
									<div>
										<dt>Role</dt>
										<dd>{member.patrolDuty}</dd>
									</div>
								{/if}
								{#if member.unitCouncil}
									<div>
										<dt>Unit Council</dt>
										<dd>Yes</dd>
									</div>
								{/if}
							</dl>
						</div>
						<span class="chevron" aria-hidden="true">&rsaquo;</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.youth {
		padding: 0.7rem 0.9rem;
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	dl {
		display: grid;
		grid-template-columns: 10.5rem 1fr;
		margin: 0.2rem 0 0;
		font-size: 1rem;
	}

	dl div {
		display: contents;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
	}

	.award {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.15rem;
	}

	.award-track {
		flex-shrink: 0;
		width: 4rem;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.award-track span {
		display: block;
		height: 100%;
		background: var(--success);
	}

	.chevron {
		color: var(--muted);
		font-size: 1.4rem;
	}
</style>
