<!--
	Record OAS: quick sign offs at a unit night. Pick the statements, pick the youth, then save them for
	everyone at once, one youth at a time (saving switches Terrain to that youth's profile and back).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import StepBar from '#lib/components/StepBar.svelte';
	import { isCoreStream } from '#lib/model/insights/insightsCalculator.js';
	import {
		MAX_LEADER_VERIFIABLE_STAGE,
		statements as templateStatements,
		type OASStatement
	} from '#lib/model/oas/recording.js';
	import {
		forYouth,
		readyToSubmit,
		type SignOffOutcome,
		type UnitOASRecord
	} from '#lib/model/oas/signOff.js';
	import type { OASStage } from '#lib/model/oas/templates.js';
	import { asc, distinct, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, members, oas, recording } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';

	type Step = 'statements' | 'youth' | 'review';

	let step = $state<Step>('statements');
	let allStages = $state<OASStage[]>([]);
	let showNonCore = $state(false);
	let selectedStream = $state('');
	let stage = $state<OASStage | null>(null);
	let statements = $state<OASStatement[]>([]);
	let selectedStatements = $state<string[]>([]);
	let youth = $state<MemberSummary[]>([]);
	let unitRecords = $state.raw(new Map<string, UnitOASRecord>());
	let selectedYouth = $state<string[]>([]);
	let patrolFilter = $state('');
	let verifier = $state(recording.defaultVerifier());
	let outcomes = $state<Record<string, SignOffOutcome>>({});
	let submitOutcomes = $state<Record<string, SignOffOutcome>>({});
	let loading = $state(false);
	let working = $state(false);
	let message = $state('');

	const unitId = $derived(app.unitId);

	onMount(async () => {
		loading = true;
		try {
			allStages = await oas.stageList();
		} catch {
			message = "Couldn't load the OAS stages from Terrain.";
		}
		loading = false;
		await openFromLink();
	});

	// Opened from a stage's analysis on Insights: start with its stage, statements and youth picked
	async function openFromLink() {
		const params = page.url.searchParams;
		const picked = allStages.find((s) => s.templateLink === params.get('template'));
		if (!picked) return;
		const list = (name: string) => (params.get(name) ?? '').split(',').filter((id) => id);
		showNonCore = !isCoreStream(picked.stream.toLowerCase());
		selectStream(picked.stream);
		await selectStage(picked);
		selectedStatements = list('statements').filter((id) =>
			statements.some((s) => s.inputId === id && canSelect(s))
		);
		if (selectedStatements.length === 0) return;
		// Moving to the youth step keeps only those who still need something
		selectedYouth = list('youth');
		await goToYouth();
	}

	const streams = $derived(
		sortBy(
			distinct(allStages.filter((s) => s.templateLink).map((s) => s.stream)).filter(
				(s) => showNonCore || isCoreStream(s.toLowerCase())
			),
			asc((s) => !isCoreStream(s.toLowerCase())),
			asc((s) => s)
		)
	);
	const stagesForStream = $derived(
		sortBy(
			allStages.filter((s) => s.stream === selectedStream && s.templateLink),
			asc((s) => s.stage),
			asc((s) => s.selectListItemText)
		)
	);
	// A stream with more than one branch at a stage needs the branch named on its button
	const stageButtonText = (option: OASStage) =>
		stagesForStream.filter((s) => s.stage === option.stage).length > 1
			? `Stage ${option.stage} · ${option.stageTitle}`
			: `Stage ${option.stage}`;
	const stageName = $derived(stage ? `${stage.stream} Stage ${stage.stage}` : '');
	const leadersCanVerify = $derived(stage !== null && stage.stage <= MAX_LEADER_VERIFIABLE_STAGE);
	const canSelect = (statement: OASStatement) => statement.isLogbook || leadersCanVerify;
	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

	function selectStream(stream: string) {
		selectedStream = stream;
		stage = null;
		statements = [];
		selectedStatements = [];
		message = '';
	}

	async function selectStage(option: OASStage) {
		stage = option;
		statements = [];
		selectedStatements = [];
		message = '';
		loading = true;
		try {
			statements = templateStatements(await recording.loadTemplate(option), null);
			if (statements.length === 0)
				message = "Couldn't find any statements for this stage in Terrain.";
		} catch {
			message = "Couldn't load this stage from Terrain.";
		}
		loading = false;
	}

	function toggleStatement(statement: OASStatement) {
		if (!canSelect(statement)) return;
		selectedStatements = selectedStatements.includes(statement.inputId)
			? selectedStatements.filter((id) => id !== statement.inputId)
			: [...selectedStatements, statement.inputId];
	}

	function selectAllStatements() {
		selectedStatements = distinct([
			...selectedStatements,
			...statements.filter(canSelect).map((s) => s.inputId)
		]);
	}

	async function goToYouth() {
		if (!stage || selectedStatements.length === 0) return;
		step = 'youth';
		message = '';
		await loadYouth();
	}

	async function loadYouth() {
		if (!stage || !unitId) return;
		loading = true;
		try {
			youth = sortBy(
				await members.youth(unitId),
				asc((m) => m.firstName),
				asc((m) => m.lastName)
			);
			unitRecords = await recording.loadUnitStage(unitId, stage);
		} catch {
			message = "Couldn't load the unit's youth from Terrain.";
		}
		// Drop anyone who no longer has something to add, e.g. after changing the statements
		selectedYouth = selectedYouth.filter((id) => youthState(id).state === 'ToAdd');
		loading = false;
	}

	const youthState = (memberId: string) => forYouth(unitRecords.get(memberId), selectedStatements);

	const patrols = $derived(
		sortBy(
			distinct(youth.map((m) => m.patrolName).filter((p) => p)),
			asc((p) => p)
		)
	);
	// Handy when a patrol did the activity together; anyone already picked in another patrol stays picked
	const visibleYouth = $derived(
		patrolFilter ? youth.filter((m) => m.patrolName === patrolFilter) : youth
	);

	function toggleYouth(memberId: string) {
		if (youthState(memberId).state !== 'ToAdd') return;
		selectedYouth = selectedYouth.includes(memberId)
			? selectedYouth.filter((id) => id !== memberId)
			: [...selectedYouth, memberId];
	}

	function selectAllYouth() {
		const toAdd = visibleYouth.filter((m) => youthState(m.id).state === 'ToAdd').map((m) => m.id);
		selectedYouth = distinct([...selectedYouth, ...toAdd]);
	}

	function goToReview() {
		if (selectedYouth.length === 0) return;
		step = 'review';
		outcomes = {};
		submitOutcomes = {};
		message = '';
	}

	const needsVerifier = $derived(
		statements.some((s) => selectedStatements.includes(s.inputId) && !s.isLogbook)
	);
	const verifierValid = $derived(
		!needsVerifier || (verifier.name.trim() !== '' && verifier.contact.trim() !== '')
	);
	const selectedInOrder = $derived(youth.filter((m) => selectedYouth.includes(m.id)));
	const outcomeList = $derived(Object.values(outcomes));
	const settled = (o: SignOffOutcome) => o.state !== 'Waiting' && o.state !== 'Saving';
	const finished = $derived(outcomeList.length > 0 && outcomeList.every(settled));
	const count = (state: SignOffOutcome['state']) =>
		outcomeList.filter((o) => o.state === state).length;
	const submitting = $derived(Object.values(submitOutcomes).some((o) => !settled(o)));
	const nameOf = (memberId: string) => {
		const m = youth.find((y) => y.id === memberId);
		return m ? `${m.firstName} ${m.lastName}` : '';
	};

	// One youth at a time: saving switches Terrain to that youth's profile and back
	async function saveAll() {
		if (!stage || working || !verifierValid) return;
		working = true;
		message = '';
		const order = selectedInOrder.map((m) => m.id);
		const ids = $state.snapshot(selectedStatements);
		const who = $state.snapshot(verifier);
		outcomes = Object.fromEntries(
			order.map((id) => [id, { state: 'Waiting', savedCount: 0, message: '' }])
		);
		for (const memberId of order) {
			outcomes[memberId] = { ...outcomes[memberId], state: 'Saving' };
			outcomes[memberId] = await recording.signOff(memberId, stage, ids, who);
		}
		working = false;
		// Pick up what was just saved, so a second round shows it as done
		await loadYouth();
	}

	// Youth this round left with every statement ticked, including the logbook
	const readyForReview = $derived(
		youth.filter(
			(m) =>
				outcomes[m.id]?.state === 'Saved' &&
				!submitOutcomes[m.id] &&
				readyToSubmit(
					unitRecords.get(m.id),
					statements.map((s) => s.inputId)
				)
		)
	);

	async function submitReady() {
		if (!stage || working) return;
		working = true;
		const ready = readyForReview.map((m) => m.id);
		for (const id of ready) submitOutcomes[id] = { state: 'Waiting', savedCount: 0, message: '' };
		for (const id of ready) {
			submitOutcomes[id] = { ...submitOutcomes[id], state: 'Saving' };
			submitOutcomes[id] = await recording.submitStage(id, stage);
		}
		working = false;
		await loadYouth();
	}

	function moreYouth() {
		selectedYouth = [];
		outcomes = {};
		submitOutcomes = {};
		step = 'youth';
	}

	function startAgain() {
		selectedYouth = [];
		selectedStatements = [];
		outcomes = {};
		submitOutcomes = {};
		patrolFilter = '';
		step = 'statements';
	}

	function statusDisplay(status: string): string {
		switch (status) {
			case 'pending_review':
				return 'Submitted for review';
			case 'pending_approval':
				return 'Waiting for approval';
			case 'approved':
				return 'Approved';
			case 'awarded':
				return 'Awarded';
			default:
				return status.replaceAll('_', ' ');
		}
	}
</script>

<svelte:head>
	<title>Beacon / Record OAS</title>
</svelte:head>

{#snippet resultIcon(outcome: SignOffOutcome)}
	<span class="result-icon {outcome.state.toLowerCase()}">
		{#if outcome.state === 'Saved'}<Icon name="check" />
		{:else if outcome.state === 'Failed'}<Icon name="x" />
		{:else if outcome.state === 'Skipped'}<Icon name="minus" />
		{:else if outcome.state === 'Saving'}<span class="spinner" role="status" aria-label="Saving"
			></span>
		{/if}
	</span>
{/snippet}

<div class="sign-off has-action-bar">
	<RecordSwitch />
	<h2>Record OAS</h2>
	<StepBar
		steps={['Statements', 'Youth', 'Save']}
		current={['statements', 'youth', 'review'].indexOf(step)}
	/>

	{#if message}
		<div class="alert alert-danger">{message}</div>
	{/if}

	{#if !unitId}
		<ChooseUnit />
	{:else if step === 'statements'}
		<div class="chip-group">
			{#each streams as stream (stream)}
				<button
					type="button"
					class="btn chip {stream === selectedStream ? 'btn-primary' : 'btn-outline-primary'}"
					disabled={loading}
					onclick={() => selectStream(stream)}>{stream}</button
				>
			{/each}
			<button
				type="button"
				class="btn btn-link chip-more"
				onclick={() => (showNonCore = !showNonCore)}
			>
				{showNonCore ? 'Fewer streams' : 'More streams'}
			</button>
		</div>

		{#if selectedStream}
			<div class="chip-group stages">
				{#each stagesForStream as option (option.templateLink)}
					<button
						type="button"
						class="btn chip {option.templateLink === stage?.templateLink
							? 'btn-primary'
							: 'btn-outline-primary'}"
						disabled={loading}
						onclick={() => selectStage(option)}>{stageButtonText(option)}</button
					>
				{/each}
			</div>
		{/if}

		{#if loading}
			<p class="muted">Loading...</p>
		{:else if stage && statements.length > 0}
			{#if !leadersCanVerify}
				<div class="alert alert-warning small">
					Adult leaders can't verify Stage {MAX_LEADER_VERIFIABLE_STAGE + 1} and above, so only the logbook
					can be ticked here.
				</div>
			{/if}
			<div class="heading-row">
				<strong>{stageName}</strong>
				<span>
					<a
						class="btn btn-link btn-sm"
						href={pagePath(
							`insights/stage/?stream=${stage.stream.toLowerCase()}&stage=${stage.stage}&branch=${stage.branch}`
						)}>Which first?</a
					>
					<button type="button" class="btn btn-link btn-sm" onclick={selectAllStatements}
						>Select all</button
					>
				</span>
			</div>
			{#each groupBy(statements, (s) => s.group) as group (group.key)}
				<div class="group-title">{group.key}</div>
				{#each group.items as statement (statement.inputId)}
					<label class="pick-row" class:disabled={!canSelect(statement)}>
						<input
							type="checkbox"
							class="form-check-input"
							checked={selectedStatements.includes(statement.inputId)}
							disabled={!canSelect(statement)}
							onchange={() => toggleStatement(statement)}
						/>
						<span>{statement.label}</span>
					</label>
				{/each}
			{/each}
		{/if}

		<div class="action-bar">
			<span class="small muted">{plural(selectedStatements.length, 'statement')}</span>
			<button
				type="button"
				class="btn btn-primary"
				disabled={selectedStatements.length === 0 || loading}
				onclick={goToYouth}>Choose youth</button
			>
		</div>
	{:else if step === 'youth'}
		<div class="small muted subtitle">
			{stageName} · {plural(selectedStatements.length, 'statement')}
		</div>

		{#if loading}
			<p class="muted">Loading the unit's youth...</p>
		{:else if youth.length > 0}
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
							onclick={() => (patrolFilter = patrolFilter === patrol ? '' : patrol)}
							>{patrol}</button
						>
					{/each}
				</div>
			{/if}
			<div class="heading-row end">
				<button type="button" class="btn btn-link btn-sm" onclick={selectAllYouth}>
					{patrolFilter
						? `Select ${patrolFilter} youth who need it`
						: 'Select everyone who needs it'}
				</button>
			</div>
			{#each visibleYouth as member (member.id)}
				{@const state = youthState(member.id)}
				<label class="pick-row" class:disabled={state.state !== 'ToAdd'}>
					<input
						type="checkbox"
						class="form-check-input"
						checked={selectedYouth.includes(member.id)}
						disabled={state.state !== 'ToAdd'}
						onchange={() => toggleYouth(member.id)}
					/>
					<span class="grow">
						{member.firstName}
						{member.lastName}
						<small class="detail muted">
							{member.patrolName}
							{#if state.state === 'AlreadyDone'}
								· already has {selectedStatements.length === 1 ? 'it' : 'these'}
							{:else if state.state === 'Locked'}
								· {statusDisplay(state.status)}, can't change
							{:else if state.toAddCount < selectedStatements.length}
								· {state.toAddCount} of {selectedStatements.length} new
							{/if}
						</small>
					</span>
				</label>
			{/each}
		{/if}

		<div class="action-bar">
			<button
				type="button"
				class="btn btn-outline-secondary"
				onclick={() => {
					step = 'statements';
					message = '';
				}}>Back</button
			>
			<button
				type="button"
				class="btn btn-primary"
				disabled={selectedYouth.length === 0 || loading}
				onclick={goToReview}>Review {selectedYouth.length} youth</button
			>
		</div>
	{:else if outcomeList.length === 0}
		<div class="card review">
			<strong>{stageName}</strong>
			<ul class="small">
				{#each statements.filter( (s) => selectedStatements.includes(s.inputId) ) as statement (statement.inputId)}
					<li>{statement.label}</li>
				{/each}
			</ul>
			<strong>For {selectedYouth.length} youth</strong>
			<div class="small">
				{selectedInOrder.map((m) => `${m.firstName} ${m.lastName}`).join(', ')}
			</div>
		</div>

		{#if needsVerifier}
			<div class="field">
				<label class="form-label small" for="verifierName">Verifier name</label>
				<input id="verifierName" class="form-control" bind:value={verifier.name} />
			</div>
			<div class="field">
				<label class="form-label small" for="verifierContact">Verifier email or phone</label>
				<input id="verifierContact" class="form-control" bind:value={verifier.contact} />
				<div class="small muted">
					Recorded in Terrain as verified by a Scout member, dated today.
				</div>
			</div>
		{/if}

		<p class="small muted">
			Beacon switches to each youth's profile in turn, adds only the statements they don't already
			have, then switches back. Nothing already recorded is changed, and nothing is submitted unless
			you choose to afterwards. Keep this page open until it finishes.
		</p>

		<div class="action-bar">
			<button
				type="button"
				class="btn btn-outline-secondary"
				onclick={() => {
					step = 'youth';
					message = '';
				}}>Back</button
			>
			<button type="button" class="btn btn-success" disabled={!verifierValid} onclick={saveAll}
				>Sign off {selectedYouth.length} youth</button
			>
		</div>
	{:else}
		<div class="progress-heading">
			<strong>{stageName}</strong>
			<div class="bar">
				<div style:width="{(100 * outcomeList.filter(settled).length) / outcomeList.length}%"></div>
			</div>
		</div>
		{#each Object.entries(outcomes) as [memberId, outcome] (memberId)}
			<div class="result-row">
				{@render resultIcon(outcome)}
				<span class="grow">
					{nameOf(memberId)}
					<small class="detail muted">
						{#if outcome.state === 'Saved'}Saved {plural(outcome.savedCount, 'statement')}
						{:else if outcome.state === 'Saving'}Saving...
						{:else if outcome.state === 'Waiting'}Waiting
						{:else}{outcome.message}{/if}
					</small>
				</span>
			</div>
		{/each}

		{#if finished}
			<div class="alert {count('Failed') > 0 ? 'alert-warning' : 'alert-success'} summary">
				Saved for {count('Saved')} youth{count('Skipped') > 0
					? `, ${count('Skipped')} skipped`
					: ''}{count('Failed') > 0
					? `, ${count('Failed')} failed. Check them in Terrain before trying again.`
					: '.'}
			</div>
			{#if readyForReview.length > 0}
				<div class="card ready">
					<strong>Ready for the Unit Council</strong>
					<div class="small">
						{readyForReview.map((m) => m.firstName).join(', ')} now {readyForReview.length === 1
							? 'has'
							: 'have'} every statement for {stageName}, including the logbook.
					</div>
					<button type="button" class="btn btn-success" disabled={working} onclick={submitReady}
						>Submit {readyForReview.length} for review</button
					>
				</div>
			{/if}
			{#if Object.keys(submitOutcomes).length > 0}
				<div class="strong submitting">Submitting for review</div>
				{#each Object.entries(submitOutcomes) as [memberId, outcome] (memberId)}
					<div class="result-row">
						{@render resultIcon(outcome)}
						<span class="grow">
							{nameOf(memberId)}
							<small class="detail muted">
								{#if outcome.state === 'Saved'}Submitted for review
								{:else if outcome.state === 'Saving'}Submitting...
								{:else if outcome.state === 'Waiting'}Waiting
								{:else}{outcome.message}{/if}
							</small>
						</span>
					</div>
				{/each}
			{/if}
			<div class="action-bar">
				<button
					type="button"
					class="btn btn-outline-primary"
					disabled={submitting}
					onclick={moreYouth}>Same statements, more youth</button
				>
				<button type="button" class="btn btn-primary" disabled={submitting} onclick={startAgain}
					>New sign off</button
				>
			</div>
		{/if}
	{/if}
</div>

<style>
	.chip-more {
		min-height: 40px;
		padding-left: 0.25rem;
	}

	.stages,
	.patrols {
		margin: 0.75rem 0;
	}

	.heading-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.5rem;
	}

	.heading-row.end {
		justify-content: flex-end;
	}

	.subtitle {
		margin-bottom: 0.5rem;
	}

	.detail {
		display: block;
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	.review {
		margin: 0 0 1rem;
	}

	.review ul {
		margin: 0.25rem 0 0.5rem;
	}

	.ready {
		margin-top: 1rem;
	}

	.ready .btn {
		margin-top: 0.5rem;
	}

	.summary,
	.submitting {
		margin-top: 1rem;
	}

	.progress-heading {
		margin-bottom: 0.5rem;
	}

	.bar {
		height: 8px;
		margin-top: 0.25rem;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.bar div {
		height: 100%;
		background: var(--success);
	}
</style>
