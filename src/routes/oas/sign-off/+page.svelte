<!--
	Record OAS: quick sign offs at a unit night. Pick the statements, pick the youth, then save them for
	everyone at once, one youth at a time (saving switches Terrain to that youth's profile and back).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import BackLink from '#lib/components/BackLink.svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import PickedStages from '#lib/components/PickedStages.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import StepBar from '#lib/components/StepBar.svelte';
	import { isCoreStream } from '#lib/model/insights/insightsCalculator.js';
	import {
		MAX_LEADER_VERIFIABLE_STAGE,
		statements as templateStatements,
		type OASStatement
	} from '#lib/model/oas/recording.js';
	import {
		combineOutcomes,
		forYouth,
		forYouthAcrossStages,
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

	/** A stage with statements picked, in the order it was first picked from */
	interface Picked {
		stage: OASStage;
		statements: OASStatement[];
		inputIds: string[];
	}

	let step = $state<Step>('statements');
	let allStages = $state<OASStage[]>([]);
	let showNonCore = $state(false);
	let selectedStream = $state('');
	let stage = $state<OASStage | null>(null);
	let statements = $state<OASStatement[]>([]);
	// Statements picked on every stage, keyed by template, so moving to another stream keeps them
	let picked = $state<Record<string, Picked>>({});
	let youth = $state<MemberSummary[]>([]);
	let unitRecords = $state.raw(new Map<string, Map<string, UnitOASRecord>>());
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
		const fromLink = allStages.find((s) => s.templateLink === params.get('template'));
		if (!fromLink) return;
		const list = (name: string) => (params.get(name) ?? '').split(',').filter((id) => id);
		showNonCore = !isCoreStream(fromLink.stream.toLowerCase());
		selectStream(fromLink.stream);
		await selectStage(fromLink);
		for (const id of list('statements')) {
			const statement = statements.find((s) => s.inputId === id);
			if (statement && !isPicked(statement)) toggleStatement(statement);
		}
		if (pickedCount === 0) return;
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
	const nameOfStage = (option: OASStage) => `${option.stream} Stage ${option.stage}`;
	const stageName = $derived(stage ? nameOfStage(stage) : '');
	const pickedStages = $derived(Object.values(picked));
	const pickedCount = $derived(pickedStages.reduce((sum, p) => sum + p.inputIds.length, 0));
	const pickedName = $derived(
		pickedStages.length === 1
			? nameOfStage(pickedStages[0].stage)
			: plural(pickedStages.length, 'stage')
	);
	const pickedInStream = (stream: string) =>
		pickedStages
			.filter((p) => p.stage.stream === stream)
			.reduce((sum, p) => sum + p.inputIds.length, 0);
	const pickedInStage = (option: OASStage) => picked[option.templateLink]?.inputIds.length ?? 0;
	const leadersCanVerify = $derived(stage !== null && stage.stage <= MAX_LEADER_VERIFIABLE_STAGE);
	const canSelect = (statement: OASStatement) => statement.isLogbook || leadersCanVerify;
	const isPicked = (statement: OASStatement) =>
		stage !== null && (picked[stage.templateLink]?.inputIds.includes(statement.inputId) ?? false);
	function plural(count: number, word: string) {
		return `${count} ${word}${count === 1 ? '' : 's'}`;
	}

	function selectStream(stream: string) {
		selectedStream = stream;
		stage = null;
		statements = [];
		message = '';
	}

	async function selectStage(option: OASStage) {
		stage = option;
		statements = [];
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

	function setPicked(inputIds: string[]) {
		if (!stage) return;
		const key = stage.templateLink;
		if (inputIds.length === 0) {
			delete picked[key];
			return;
		}
		// Kept in the stage's own order, whatever order they were ticked in
		const ordered = statements.map((s) => s.inputId).filter((id) => inputIds.includes(id));
		picked[key] = { stage, statements: $state.snapshot(statements), inputIds: ordered };
	}

	function toggleStatement(statement: OASStatement) {
		if (!stage || !canSelect(statement)) return;
		const current = picked[stage.templateLink]?.inputIds ?? [];
		setPicked(
			current.includes(statement.inputId)
				? current.filter((id) => id !== statement.inputId)
				: [...current, statement.inputId]
		);
	}

	function selectAllStatements() {
		if (!stage) return;
		setPicked(
			distinct([
				...(picked[stage.templateLink]?.inputIds ?? []),
				...statements.filter(canSelect).map((s) => s.inputId)
			])
		);
	}

	async function openPicked(option: OASStage) {
		if (!isCoreStream(option.stream.toLowerCase())) showNonCore = true;
		selectStream(option.stream);
		await selectStage(option);
	}

	function unpick(stages: OASStage[]) {
		for (const option of stages) delete picked[option.templateLink];
	}

	async function goToYouth() {
		if (pickedCount === 0) return;
		step = 'youth';
		message = '';
		await loadYouth();
	}

	async function loadYouth() {
		if (pickedCount === 0 || !unitId) return;
		loading = true;
		try {
			youth = sortBy(
				await members.youth(unitId),
				asc((m) => m.firstName),
				asc((m) => m.lastName)
			);
			const records: [string, Map<string, UnitOASRecord>][] = [];
			for (const p of pickedStages)
				records.push([p.stage.templateLink, await recording.loadUnitStage(unitId, p.stage)]);
			unitRecords = new Map(records);
		} catch {
			message = "Couldn't load the unit's youth from Terrain.";
		}
		// Drop anyone who no longer has something to add, e.g. after changing the statements
		selectedYouth = selectedYouth.filter((id) => youthState(id).state === 'ToAdd');
		loading = false;
	}

	const recordFor = (memberId: string, option: OASStage) =>
		unitRecords.get(option.templateLink)?.get(memberId);
	const youthState = (memberId: string) =>
		forYouthAcrossStages(
			pickedStages.map((p) => forYouth(recordFor(memberId, p.stage), p.inputIds))
		);

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
		pickedStages.some((p) =>
			p.statements.some((s) => p.inputIds.includes(s.inputId) && !s.isLogbook)
		)
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

	// One youth at a time, a stage at a time: saving switches Terrain to that youth's profile and back
	async function saveAll() {
		if (pickedCount === 0 || working || !verifierValid) return;
		working = true;
		message = '';
		const order = selectedInOrder.map((m) => m.id);
		const stages = $state.snapshot(pickedStages);
		const who = $state.snapshot(verifier);
		outcomes = Object.fromEntries(
			order.map((id) => [id, { state: 'Waiting', savedCount: 0, message: '' }])
		);
		for (const memberId of order) {
			outcomes[memberId] = { ...outcomes[memberId], state: 'Saving' };
			const results: { name: string; outcome: SignOffOutcome }[] = [];
			for (const p of stages)
				results.push({
					name: nameOfStage(p.stage),
					outcome: await recording.signOff(memberId, p.stage, p.inputIds, who)
				});
			outcomes[memberId] = combineOutcomes(results);
		}
		working = false;
		// Pick up what was just saved, so a second round shows it as done
		await loadYouth();
	}

	// Each youth and stage this round left with every statement ticked, including the logbook
	const readyForReview = $derived(
		youth.flatMap((m) =>
			outcomes[m.id] && outcomes[m.id].savedCount > 0
				? pickedStages
						.filter(
							(p) =>
								!submitOutcomes[submitKey(m.id, p.stage)] &&
								readyToSubmit(
									recordFor(m.id, p.stage),
									p.statements.map((s) => s.inputId)
								)
						)
						.map((p) => ({ member: m, stage: p.stage }))
				: []
		)
	);
	const readyNames = $derived(
		groupBy(readyForReview, (r) => nameOfStage(r.stage)).map(
			(g) => `${g.items.map((r) => r.member.firstName).join(', ')} for ${g.key}`
		)
	);

	function submitKey(memberId: string, option: OASStage) {
		return `${memberId}|${option.templateLink}`;
	}

	async function submitReady() {
		if (working) return;
		working = true;
		const ready = readyForReview.map((r) => ({ key: submitKey(r.member.id, r.stage), ...r }));
		for (const r of ready) submitOutcomes[r.key] = { state: 'Waiting', savedCount: 0, message: '' };
		for (const r of ready) {
			submitOutcomes[r.key] = { ...submitOutcomes[r.key], state: 'Saving' };
			submitOutcomes[r.key] = await recording.submitStage(r.member.id, r.stage);
		}
		working = false;
		await loadYouth();
	}

	const submittedName = (key: string) => {
		const [memberId, templateLink] = key.split('|');
		const option = allStages.find((s) => s.templateLink === templateLink);
		return pickedStages.length > 1 && option
			? `${nameOf(memberId)} · ${nameOfStage(option)}`
			: nameOf(memberId);
	};

	function moreYouth() {
		selectedYouth = [];
		outcomes = {};
		submitOutcomes = {};
		step = 'youth';
	}

	function startAgain() {
		selectedYouth = [];
		picked = {};
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
	<!-- Moving between OAS, activities and SIAs is for the start; within the flow, back is top left -->
	{#if step === 'statements'}
		<RecordSwitch />
	{:else if outcomeList.length === 0}
		<BackLink
			label={step === 'youth' ? 'Statements' : 'Youth'}
			onclick={() => {
				step = step === 'youth' ? 'statements' : 'youth';
				message = '';
			}}
		/>
	{/if}
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
					onclick={() => selectStream(stream)}
					>{stream}{#if pickedInStream(stream) > 0}<span class="picked-count"
							>{pickedInStream(stream)}<span class="visually-hidden"> picked</span></span
						>{/if}</button
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
						onclick={() => selectStage(option)}
						>{stageButtonText(option)}{#if pickedInStage(option) > 0}<span class="picked-count"
								>{pickedInStage(option)}<span class="visually-hidden"> picked</span></span
							>{/if}</button
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
							checked={isPicked(statement)}
							disabled={!canSelect(statement)}
							onchange={() => toggleStatement(statement)}
						/>
						<span>{statement.label}</span>
					</label>
				{/each}
			{/each}
		{/if}

		<PickedStages
			picked={pickedStages.map((p) => ({ stage: p.stage, count: p.inputIds.length }))}
			disabled={loading}
			onopen={openPicked}
			onclear={unpick}
		/>

		<div class="action-bar">
			<span class="small muted">{plural(pickedCount, 'statement')}</span>
			<button
				type="button"
				class="btn btn-primary"
				disabled={pickedCount === 0 || loading}
				onclick={goToYouth}>Choose youth</button
			>
		</div>
	{:else if step === 'youth'}
		<div class="small muted subtitle">
			{pickedName} · {plural(pickedCount, 'statement')}
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
								· already has {pickedCount === 1 ? 'it' : 'these'}
							{:else if state.state === 'Locked'}
								· {pickedStages.length === 1
									? `${statusDisplay(state.status)}, can't change`
									: 'nothing to add that can be changed'}
							{:else if state.toAddCount < pickedCount}
								· {state.toAddCount} of {pickedCount} new
							{/if}
						</small>
					</span>
				</label>
			{/each}
		{/if}

		<div class="action-bar">
			<span class="small muted">{selectedYouth.length} youth picked</span>
			<button
				type="button"
				class="btn btn-primary"
				disabled={selectedYouth.length === 0 || loading}
				onclick={goToReview}>Review {selectedYouth.length} youth</button
			>
		</div>
	{:else if outcomeList.length === 0}
		<div class="card review">
			{#each pickedStages as p (p.stage.templateLink)}
				<strong>{nameOfStage(p.stage)}</strong>
				<ul class="small">
					{#each p.statements.filter( (s) => p.inputIds.includes(s.inputId) ) as statement (statement.inputId)}
						<li>{statement.label}</li>
					{/each}
				</ul>
			{/each}
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
			<span class="small muted">{plural(pickedCount, 'statement')}</span>
			<button type="button" class="btn btn-success" disabled={!verifierValid} onclick={saveAll}
				>Sign off {selectedYouth.length} youth</button
			>
		</div>
	{:else}
		<div class="progress-heading">
			<strong>{pickedName}</strong>
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
						Every statement, including the logbook, is now done by {readyNames.join('; ')}.
					</div>
					<button type="button" class="btn btn-success" disabled={working} onclick={submitReady}
						>Submit {readyForReview.length} for review</button
					>
				</div>
			{/if}
			{#if Object.keys(submitOutcomes).length > 0}
				<div class="strong submitting">Submitting for review</div>
				{#each Object.entries(submitOutcomes) as [key, outcome] (key)}
					<div class="result-row">
						{@render resultIcon(outcome)}
						<span class="grow">
							{submittedName(key)}
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
	.picked-count {
		display: inline-block;
		min-width: 1.4em;
		margin-left: 0.4em;
		padding: 0 0.35em;
		border-radius: 999px;
		background: var(--warning, #f0ad4e);
		color: #000;
		font-size: 0.75em;
		font-weight: 600;
		line-height: 1.4;
	}

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
