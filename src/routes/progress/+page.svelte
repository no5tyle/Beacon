<!-- Progress: the unit's youth, each opening their progress details -->
<script lang="ts">
	import { onMount } from 'svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import { asc, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { today } from '#lib/model/dates.js';
	import { moveUpBadge, peakAwardBreakdown } from '#lib/model/insights/insightsCalculator.js';
	import { rulesFor } from '#lib/model/insights/settings.js';
	import { app, members, unitProgress } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import { readInsightsSettings } from '#lib/stores/storage.js';

	let youth = $state<MemberSummary[]>([]);
	let loading = $state(false);
	let message = $state('');
	// Each youth's award progress and logbook, once the unit's progress is loaded (by Insights, or in the
	// background). Nothing is loaded just for this
	let loaded = $state<Record<string, { percent: number; nights: number; kms: number }>>({});
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
		loaded = Object.fromEntries(
			all.map((p) => [
				p.memberId,
				{
					percent: Math.round(
						peakAwardBreakdown(p, rules).reduce((total, c) => total + c.earned, 0)
					),
					nights: p.nightsCamped,
					kms: p.kMsHiked
				}
			])
		);
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
</script>

<svelte:head>
	<title>Beacon / Progress</title>
</svelte:head>

<div use:pullToRefresh={refresh}>
	<div class="page-head">
		<h2>Progress{app.unitName ? ` (${app.unitName})` : ''}</h2>
		{#if youth.length > 0}
			<a class="btn btn-outline-primary btn-sm" href={pagePath('progress/report/')}
				><Icon name="print" /> Reports</a
			>
		{/if}
	</div>

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
				{@const moveUp = moveUpBadge(member.dateOfBirth, rules, settings, now)}
				<li>
					<a class="card row-link youth" href={pagePath(`progress/${member.id}/`)}>
						<div class="grow">
							<div class="name-row">
								<span class="strong">{member.firstName} {members.lastName(member)}</span>
								{#if moveUp}
									<span class="badge move-up {badgeClass[moveUp.urgency]}">{moveUp.text}</span>
								{/if}
							</div>
							{#if loaded[member.id]}
								{@const summary = loaded[member.id]}
								<div class="award-track" aria-hidden="true">
									<span style:width="{summary.percent}%"></span>
								</div>
								<div class="award small muted">
									<span>{rules.peakAwardName} {summary.percent}%</span>
									<span class="logbook">
										<span title="Nights camped" aria-label="{summary.nights} nights camped"
											><span aria-hidden="true">⛺</span> {summary.nights}</span
										>
										<span title="Kilometres hiked" aria-label="{summary.kms} km hiked"
											><span aria-hidden="true">🥾</span> {summary.kms} km</span
										>
									</span>
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
	.name-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.5rem;
	}

	.move-up {
		font-size: 0.72rem;
		font-weight: 600;
	}

	.badge-plain {
		background: var(--surface-2);
		color: var(--muted);
	}

	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.page-head .btn {
		flex-shrink: 0;
		margin-top: 0.4rem;
	}

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

	/* The award's progress, the width of the card, with the numbers beneath */
	.award-track {
		height: 6px;
		margin: 0.4rem 0 0.3rem;
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

	.award {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.6rem;
		margin-bottom: 0.2rem;
	}

	/* Nights and km stay together, moving to the next line as a pair when there isn't room */
	.logbook {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		white-space: nowrap;
	}

	.chevron {
		color: var(--muted);
		font-size: 1.4rem;
	}
</style>
