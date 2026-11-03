<!--
	Approvals history: what the chosen unit's Unit Council has finished with, most recent first, from the
	last few months or all of it, for one or more youth. Reached from the Approvals page's filters.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import BackLink from '#lib/components/BackLink.svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MultiSelect from '#lib/components/MultiSelect.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import {
		decidedWithin,
		outcomeDisplay,
		RECENT_DAYS,
		submittedDisplay,
		type DecidedSubmission
	} from '#lib/model/approvals.js';
	import { asc, distinct, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, approvals } from '#lib/services/index.js';
	import { unitsKey } from '#lib/stores/approvals.svelte.js';

	let history = $state<DecidedSubmission[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	let showOlder = $state(false);
	// Youth to show; none picked means everyone
	let youth = $state<string[]>([]);

	const units = $derived(app.chosenUnits);
	const unitsId = $derived(unitsKey(units));

	async function load() {
		const id = unitsId;
		if (!id || loading) return;
		loading = true;
		errorMessage = '';
		try {
			const found = await approvals.historyIn(units);
			if (id === unitsId) history = found.list;
		} catch {
			errorMessage = "Couldn't load the history from Terrain. Try again in a moment.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// The history is for leaders on the Unit Council; a youth goes back to Home
		if (app.isYouth) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		void unitsId;
		history = [];
		youth = [];
		showOlder = false;
		// Only the unit reloads it; what load() reads, such as whether it's loading, mustn't
		untrack(load);
	});

	const recent = $derived(history.filter((h) => decidedWithin(h, RECENT_DAYS)));
	const names = $derived(
		sortBy(
			distinct(history.map((h) => h.memberName)),
			asc((n) => n)
		)
	);
	const shown = $derived(
		(showOlder ? history : recent).filter((h) => youth.length === 0 || youth.includes(h.memberName))
	);
	const voters = (list: { name: string }[]) => list.map((v) => v.name).join(', ');
</script>

<svelte:head>
	<title>Beacon / Approvals history</title>
</svelte:head>

<div use:pullToRefresh={load}>
	<BackLink href={pagePath('approvals/')} label="Approvals" />
	<div class="history-header">
		<h2>History</h2>
		<button
			type="button"
			class="btn icon-btn btn-outline-secondary"
			onclick={load}
			disabled={loading || !unitsId}
			title="Check Terrain again"
			aria-label="Refresh"
		>
			<Icon name="reload" />
		</button>
	</div>

	{#if !unitsId}
		<ChooseUnit />
	{:else if loading && history.length === 0}
		<p class="muted">Loading the history from Terrain...</p>
	{:else if errorMessage}
		<div class="alert alert-danger">{errorMessage}</div>
	{:else if history.length === 0}
		<div class="history-empty">Nothing has been through the Unit Council yet.</div>
	{:else}
		{#if names.length > 1}
			<div class="history-filter">
				<MultiSelect
					id="historyYouth"
					label="Youth"
					options={names}
					bind:selected={youth}
					noun="youth"
				/>
			</div>
		{/if}
		<p class="small muted">
			{showOlder
				? `All ${history.length} the Unit Council has finished with, most recent first.`
				: `Finished with in the last ${RECENT_DAYS} days, most recent first.`}
		</p>
		{#if shown.length === 0}
			<p class="muted">
				Nothing{youth.length > 0 ? ' for the youth picked' : ''}{showOlder
					? ''
					: ` in the last ${RECENT_DAYS} days`}.
			</p>
		{/if}
		{#each shown as item (item.submissionId)}
			<div class="history-card">
				<div class="history-title">
					<span class="strong">{item.memberName}</span>
					<span class="badge {item.outcome === 'approved' ? 'badge-success' : 'badge-muted'}"
						>{outcomeDisplay(item.outcome)}</span
					>
				</div>
				<div>{item.achievementName}</div>
				<div class="small muted">
					{item.submissionType} · decided {submittedDisplay(item.decidedOn)} · submitted {submittedDisplay(
						item.submittedOn
					)}
				</div>
				{#if item.approvedBy.length > 0 || item.improveBy.length > 0}
					<div class="small votes">
						{#if item.approvedBy.length > 0}
							<span class="text-success"
								><Icon name="check" /> Approved by {voters(item.approvedBy)}</span
							>
						{/if}
						{#if item.improveBy.length > 0}
							<span class="text-danger"
								><Icon name="action-undo" /> Improvement asked by {voters(item.improveBy)}</span
							>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if !showOlder && history.length > recent.length}
			<button type="button" class="btn btn-outline-secondary" onclick={() => (showOlder = true)}
				>Show older ({history.length - recent.length})</button
			>
		{/if}
	{/if}
</div>

<style>
	.history-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.history-header h2 {
		margin: 0;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border-radius: 50%;
	}

	.history-filter {
		margin-bottom: 0.75rem;
	}

	.history-card {
		margin-bottom: 0.5rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.history-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.badge-muted {
		background: var(--faint);
	}

	.votes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.75rem;
		margin-top: 0.15rem;
	}

	.history-empty {
		padding: 1.5rem 1rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
		color: var(--muted);
		text-align: center;
	}
</style>
