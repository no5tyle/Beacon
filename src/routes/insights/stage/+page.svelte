<!--
	One OAS stage looked at closely, opened from a cell in the Insights heatmap: its statements in the order
	worth programming them, for the youth it is the next stage for, and a shortcut to sign them off.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import {
		analyseStage,
		type StageYouth,
		type StatementPriority
	} from '#lib/model/insights/stageAnalysis.js';
	import { MAX_LEADER_VERIFIABLE_STAGE } from '#lib/model/oas/recording.js';
	import { asc, compareText, distinct, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, insights } from '#lib/services/index.js';
	import type { StageReport } from '#lib/services/insights.js';
	import { readFocusIds, readInsightsSettings } from '#lib/stores/storage.js';

	const stream = $derived((page.url.searchParams.get('stream') ?? '').toLowerCase());
	const stageNumber = $derived(Number(page.url.searchParams.get('stage')));
	const branch = $derived(page.url.searchParams.get('branch') ?? '');

	let report = $state.raw<StageReport | null>(null);
	let loading = $state(false);
	let message = $state('');
	let patrolFilter = $state('');
	let expanded = $state<string[]>([]);
	let selected = $state<string[]>([]);

	async function load() {
		const unitId = app.unitId;
		if (!unitId || !stream || !stageNumber) return;
		loading = true;
		message = '';
		try {
			const loaded = await insights.stageReport(
				unitId,
				readInsightsSettings(),
				readFocusIds(unitId),
				stream,
				stageNumber,
				branch
			);
			if (unitId !== app.unitId) return;
			report = loaded;
			if (!loaded) message = "Couldn't find this stage in Terrain.";
		} catch {
			message = "Couldn't load this stage from Terrain.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		// Insights is for leaders; a youth goes back to Home
		if (app.isYouth) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		void [app.unitId, stream, stageNumber, branch];
		report = null;
		selected = [];
		expanded = [];
		load();
	});

	const title = $derived(
		report
			? `${report.stage.stream} Stage ${report.stage.stage}`
			: stream
				? `${stream.charAt(0).toUpperCase()}${stream.slice(1)} Stage ${stageNumber}`
				: 'Stage'
	);
	const patrols = $derived(
		report
			? sortBy(
					distinct(report.candidates.map((c) => c.patrol).filter((p) => p)),
					asc((p) => p)
				)
			: []
	);
	const analysis = $derived(
		report
			? analyseStage(
					report.statements,
					report.candidates.filter((c) => !patrolFilter || c.patrol === patrolFilter),
					report.records
				)
			: null
	);
	const byId = $derived(new Map((analysis?.youth ?? []).map((y) => [y.memberId, y])));
	const names = (ids: readonly string[]) =>
		ids
			.map((id) => byId.get(id))
			.filter((y): y is StageYouth => y !== undefined)
			.sort((a, b) => compareText(a.name, b.name));
	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

	// Leaders can't verify Stage 6 and above, so only the logbook can be signed off there
	const leadersCanVerify = $derived(
		report !== null && report.stage.stage <= MAX_LEADER_VERIFIABLE_STAGE
	);
	const canSignOff = (priority: StatementPriority) =>
		priority.statement.isLogbook || leadersCanVerify;

	const toggle = (list: string[], id: string) =>
		list.includes(id) ? list.filter((i) => i !== id) : [...list, id];

	// Everyone who needs at least one of the picked statements
	const youthForSelected = $derived(
		distinct(
			(analysis?.statements ?? [])
				.filter((p) => selected.includes(p.statement.inputId))
				.flatMap((p) => p.neededBy)
		)
	);

	function signOff() {
		if (!report || selected.length === 0) return;
		const query = new URLSearchParams({
			template: report.stage.templateLink,
			statements: selected.join(','),
			youth: youthForSelected.join(',')
		});
		goto(pagePath(`oas/sign-off/?${query}`));
	}

	function chooseBranch(value: string) {
		const query = new URLSearchParams({ stream, stage: String(stageNumber), branch: value });
		goto(pagePath(`insights/stage/?${query}`), { replaceState: true });
	}

	async function refresh() {
		if (loading) return;
		await load();
	}
</script>

<svelte:head>
	<title>Beacon / {title}</title>
</svelte:head>

<div class="has-action-bar" use:pullToRefresh={refresh}>
	<div class="title-row">
		<h2>{title}</h2>
		<a href={pagePath('insights/')} class="btn btn-outline-secondary btn-sm">Insights</a>
	</div>

	{#if !app.unitId}
		<ChooseUnit />
	{/if}

	{#if report && report.branches.length > 1}
		<div class="chip-group branches" aria-label="Branch">
			{#each report.branches as option (option.templateLink)}
				<button
					type="button"
					class="btn chip {option.templateLink === report.stage.templateLink
						? 'btn-primary'
						: 'btn-outline-primary'}"
					onclick={() => chooseBranch(option.branch)}>{option.stageTitle}</button
				>
			{/each}
		</div>
	{/if}

	{#if message}
		<div class="alert alert-danger">{message}</div>
	{/if}

	{#if loading && !report}
		<p class="muted">Working out what's needed for this stage...</p>
	{:else if report && analysis}
		<p class="muted intro">
			Statements in the order worth programming them, for youth who have this as their next stage:
			those who have completed Stage {report.stage.stage - 1} but not this one. Statements that finish
			the stage for someone, and those priority youth need, come first.
		</p>

		{#if patrols.length > 1}
			<div class="chip-group patrols" aria-label="Patrol">
				<button
					type="button"
					class="btn chip {patrolFilter === '' ? 'btn-primary' : 'btn-outline-primary'}"
					onclick={() => (patrolFilter = '')}>Everyone</button
				>
				{#each patrols as patrol (patrol)}
					<button
						type="button"
						class="btn chip {patrol === patrolFilter ? 'btn-primary' : 'btn-outline-primary'}"
						onclick={() => (patrolFilter = patrolFilter === patrol ? '' : patrol)}>{patrol}</button
					>
				{/each}
			</div>
		{/if}

		<div class="tiles">
			<div class="stat-tile">
				<div class="stat-label">Next stage for</div>
				<div class="stat-value">{analysis.workingTowards}</div>
				<div class="stat-note">youth</div>
			</div>
			<div class="stat-tile">
				<div class="stat-label">Started</div>
				<div class="stat-value">{analysis.started}</div>
				<div class="stat-note">in Terrain</div>
			</div>
			<div class="stat-tile">
				<div class="stat-label">Nearly done</div>
				<div class="stat-value">{analysis.nearlyDone}</div>
				<div class="stat-note">1 or 2 statements left</div>
			</div>
			<div class="stat-tile">
				<div class="stat-label">Submitted</div>
				<div class="stat-value">{analysis.submitted}</div>
				<div class="stat-note">waiting for review</div>
			</div>
		</div>

		{#if analysis.statements.length === 0}
			<p class="muted">
				{analysis.youth.length === 0
					? `No youth${patrolFilter ? ` in ${patrolFilter}` : ''} have this as their next stage.`
					: 'Nothing is outstanding: everyone with this as their next stage has submitted it.'}
			</p>
		{:else}
			<h3>Statements to programme first</h3>
			{#if !leadersCanVerify}
				<div class="alert alert-warning small">
					Adult leaders can't verify Stage {MAX_LEADER_VERIFIABLE_STAGE + 1} and above, so only the logbook
					can be signed off from here.
				</div>
			{/if}
			<ol class="ranked">
				{#each analysis.statements as priority, i (priority.statement.inputId)}
					{@const id = priority.statement.inputId}
					{@const open = expanded.includes(id)}
					<li class="statement" class:open>
						<input
							type="checkbox"
							class="form-check-input"
							aria-label="Pick to sign off: {priority.statement.label}"
							checked={selected.includes(id)}
							disabled={!canSignOff(priority)}
							onchange={() => (selected = toggle(selected, id))}
						/>
						<span class="rank" aria-hidden="true">{i + 1}</span>
						<div class="body">
							<button
								type="button"
								class="statement-text"
								aria-expanded={open}
								onclick={() => (expanded = toggle(expanded, id))}
							>
								<span class="badge badge-part">{priority.statement.group}</span>
								{priority.statement.label}
							</button>
							<div class="meta">
								<span class="badge badge-info">{priority.statement.theme}</span>
								<span
									class="badge {priority.statement.unitNightSuitable
										? 'badge-success'
										: 'badge-muted'}"
									>{priority.statement.unitNightSuitable ? 'unit night' : 'outing'}</span
								>
							</div>
							<div class="small counts">
								Needed by <strong>{priority.neededBy.length}</strong> of {analysis.workingTowards}
								{#if priority.lastFor.length > 0}
									· <span class="finishes">finishes the stage for {priority.lastFor.length}</span>
								{/if}
								{#if priority.secondLastFor.length > 0}
									· one of the last two for {priority.secondLastFor.length}
								{/if}
								{#if priority.priorityNeeding.length > 0}
									· {priority.priorityNeeding.length} priority
								{/if}
							</div>
							{#if open}
								<div class="detail">
									{#if priority.statement.detail}
										<em>{priority.statement.detail}</em>
									{:else}
										<em class="muted">Terrain has no further explanation for this statement.</em>
									{/if}
								</div>
								<ul class="who small">
									{#each names(priority.neededBy) as youth (youth.memberId)}
										<li>
											{youth.name}
											<span class="muted">{youth.patrol}</span>
											{#if youth.remaining.length === 1}<span class="badge badge-success"
													>last one</span
												>{/if}
											{#if youth.priority}<span class="badge">{youth.priority}</span>{/if}
											{#if !youth.started}<span class="muted">· not started</span>{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</li>
				{/each}
			</ol>

			{#if analysis.themes.length > 0}
				<h3>By theme</h3>
				<p class="muted small">
					One activity on a theme can cover all its statements. "Finishes" counts youth for whom
					everything they have left is in that theme.
				</p>
				<table class="table stack-table themes">
					<thead>
						<tr>
							<th>Theme</th>
							<th class="num">Statements</th>
							<th class="num">Needed by</th>
							<th class="num">Finishes</th>
						</tr>
					</thead>
					<tbody>
						{#each analysis.themes as theme (theme.theme)}
							<tr>
								<td class="stack-title">{theme.theme}</td>
								<td class="num" data-label="Statements">{theme.statements.length}</td>
								<td class="num" data-label="Needed by">{theme.neededBy.length}</td>
								<td class="num" data-label="Finishes">{theme.finishesFor.length}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/if}

		<div class="action-bar">
			<span class="small muted"
				>{plural(selected.length, 'statement')}{selected.length > 0
					? `, ${youthForSelected.length} youth`
					: ''}</span
			>
			<button
				type="button"
				class="btn btn-primary"
				disabled={selected.length === 0}
				onclick={signOff}>Sign these off</button
			>
		</div>
	{/if}
</div>

<style>
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.title-row h2 {
		margin: 0;
	}

	.intro {
		margin-bottom: 0.75rem;
	}

	.branches,
	.patrols {
		margin-bottom: 0.75rem;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 575.98px) {
		.tiles {
			grid-template-columns: 1fr 1fr;
		}
	}

	.stat-tile {
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.stat-label {
		color: var(--muted);
		font-size: 0.75rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.stat-note {
		color: var(--muted);
		font-size: 0.8rem;
	}

	h3 {
		margin-top: 0.75rem;
	}

	.ranked {
		margin: 0 0 1.5rem;
		padding: 0;
		list-style: none;
	}

	.statement {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.statement + .statement {
		margin-top: 0.5rem;
	}

	.statement.open {
		border-color: var(--ref-open-border);
		background: var(--ref-open-bg);
	}

	.statement input {
		flex-shrink: 0;
		width: 1.3rem;
		height: 1.3rem;
		margin-top: 0.15rem;
	}

	.rank {
		flex: 0 0 1.5rem;
		color: var(--muted);
		font-weight: 600;
		text-align: right;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.statement-text {
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

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.3rem;
	}

	.counts {
		margin-top: 0.3rem;
		color: var(--text-2);
	}

	.finishes {
		color: var(--success);
		font-weight: 600;
	}

	.detail {
		margin-top: 0.4rem;
		color: var(--text-2);
		font-size: 0.85rem;
		white-space: pre-line;
	}

	.who {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
	}

	.who .badge {
		margin-left: 0.25rem;
	}

	.themes {
		margin-bottom: 1.5rem;
	}
</style>
