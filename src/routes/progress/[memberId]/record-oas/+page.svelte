<!--
	Record one youth's OAS: tick the statements they've done, save them to Terrain on their behalf,
	then submit the stage for review. The Unit Council still approves it in Terrain.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { dayMonthYear, today } from '#lib/model/dates.js';
	import { isCoreStream } from '#lib/model/insights/insightsCalculator.js';
	import {
		allComplete,
		canReceiveCredit,
		isEditable,
		isPreviousStageComplete,
		MAX_LEADER_VERIFIABLE_STAGE,
		type OASStatement
	} from '#lib/model/oas/recording.js';
	import type { OASStage } from '#lib/model/oas/templates.js';
	import { asc, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, members, oas, recording } from '#lib/services/index.js';
	import { recordStatus, type OASRecordingState } from '#lib/services/recording.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import type { TerrainWriteResult } from '#lib/terrain/errors.js';

	const memberId = $derived(page.params.memberId ?? '');

	let member = $state<MemberSummary | null>(null);
	let allStages = $state<OASStage[]>([]);
	let loadingStages = $state(true);
	let showNonCoreOAS = $state(false);
	let selectedTemplateLink = $state('');
	let record = $state<OASRecordingState | null>(null);
	let ticked = $state<string[]>([]);
	let verifier = $state(recording.defaultVerifier());
	let loading = $state(false);
	let confirmingSave = $state(false);
	let confirmingSubmit = $state(false);
	let working = $state(false);
	let message = $state('');
	let messageIsError = $state(false);

	onMount(async () => {
		// Recording is for leaders; a youth goes back to Home
		if (app.isYouth) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		try {
			member = await members.member(app.unitId, memberId);
			allStages = await oas.stageList();
		} catch {
			showMessage("Couldn't load the OAS stages from Terrain.", true);
		}
		loadingStages = false;

		// Stream and stage can be passed in from the progress page, e.g. ?stream=bushwalking&stage=3
		const stream = page.url.searchParams.get('stream') ?? '';
		const stageNumber = Number(page.url.searchParams.get('stage'));
		if (stream && Number.isInteger(stageNumber) && stageNumber > 0) {
			showNonCoreOAS = !isCoreStream(stream.toLowerCase());
			const same = (a: string) => a.toLowerCase() === stream.toLowerCase();
			const stage = sortBy(
				stageOptions.filter((s) => same(s.stream) && s.stage === stageNumber),
				asc((s) => !same(s.branch))
			)[0];
			if (stage) {
				selectedTemplateLink = stage.templateLink;
				await loadStage();
			}
		}
	});

	const stageOptions = $derived(
		sortBy(
			allStages
				.filter((s) => s.templateLink)
				.filter((s) => showNonCoreOAS || isCoreStream(s.stream.toLowerCase())),
			asc((s) => s.stream),
			asc((s) => s.stage),
			asc((s) => s.selectListItemText)
		)
	);

	async function loadStage() {
		record = null;
		ticked = [];
		confirmingSave = false;
		confirmingSubmit = false;
		const stage = allStages.find((s) => s.templateLink === selectedTemplateLink);
		if (!stage) return;
		loading = true;
		try {
			record = await recording.loadStage(memberId, stage);
		} catch {
			showMessage("Couldn't load this stage from Terrain.", true);
		}
		loading = false;
	}

	const status = $derived(record ? recordStatus(record) : '');
	const canEdit = $derived(record !== null && isEditable(status));
	const canVerifyStatements = $derived(
		record !== null && record.stage.stage <= MAX_LEADER_VERIFIABLE_STAGE
	);
	const canTick = (statement: OASStatement) =>
		canEdit && !statement.alreadyDone && (statement.isLogbook || canVerifyStatements);
	const newlyTicked = $derived(record?.statements.filter((s) => ticked.includes(s.inputId)) ?? []);
	const verifierValid = $derived(verifier.name.trim() !== '' && verifier.contact.trim() !== '');
	const readyToSubmit = $derived(
		record !== null &&
			canEdit &&
			record.achievement !== null &&
			ticked.length === 0 &&
			allComplete(record.statements) &&
			canReceiveCredit(record.stage.stage, record.completedStagesInStream)
	);
	const stageTitle = $derived(record ? `${record.stage.stream} Stage ${record.stage.stage}` : '');
	const doneCount = $derived(record?.statements.filter((s) => s.alreadyDone).length ?? 0);
	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

	function statusDisplay(value: string): string {
		switch (value) {
			case '':
				return 'Not started';
			case 'in_progress':
			case 'draft_review':
				return 'In progress';
			case 'feedback_review':
				return 'Needs improvement';
			case 'pending_review':
				return 'Submitted, waiting for Unit Council review';
			case 'pending_approval':
				return 'Waiting for approval';
			case 'approved':
				return 'Approved';
			case 'awarded':
				return 'Awarded';
			default:
				return value.replaceAll('_', ' ');
		}
	}

	function toggle(statement: OASStatement, on: boolean) {
		ticked = on ? [...ticked, statement.inputId] : ticked.filter((id) => id !== statement.inputId);
		confirmingSave = false;
	}

	function tickAllRemaining() {
		const remaining = (record?.statements ?? []).filter(canTick).map((s) => s.inputId);
		ticked = [...new Set([...ticked, ...remaining])];
		confirmingSave = false;
	}

	function startSave() {
		message = '';
		if (newlyTicked.length === 0) return showMessage('Tick at least one statement first.', true);
		if (newlyTicked.some((s) => !s.isLogbook) && !verifierValid)
			return showMessage("Enter the verifier's name and email or phone.", true);
		confirmingSave = true;
	}

	async function confirmSave() {
		if (!record || working) return;
		working = true;
		const count = newlyTicked.length;
		const result = await recording.saveVerifications(record, $state.snapshot(newlyTicked), {
			...verifier
		});
		working = false;
		confirmingSave = false;
		if (result.success) {
			await loadStage();
			showMessage(`Saved ${plural(count, 'statement')} to Terrain.`, false);
		} else {
			showMessage(failureMessage('save', result), true);
		}
	}

	function startSubmit() {
		message = '';
		confirmingSubmit = true;
	}

	async function confirmSubmit() {
		if (!record || working) return;
		working = true;
		const result = await recording.submitForReview(record);
		working = false;
		confirmingSubmit = false;
		if (result.success) {
			await loadStage();
			showMessage('Submitted. It now needs approval by the Unit Council in Terrain.', false);
		} else {
			showMessage(failureMessage('submit', result), true);
		}
	}

	function failureMessage(action: string, result: TerrainWriteResult): string {
		if (result.status > 0)
			return `Terrain didn't accept the ${action} (response ${result.status}). Check the stage in Terrain before trying again.`;
		return result.body || `Couldn't ${action}. Check the stage in Terrain before trying again.`;
	}

	function showMessage(text: string, isError: boolean) {
		message = text;
		messageIsError = isError;
	}
</script>

<svelte:head>
	<title>Beacon / Record OAS</title>
</svelte:head>

<h2>Record OAS for {member ? `${member.firstName} ${members.lastName(member)}` : ''}</h2>
<p class="muted intro">
	Tick the "I" statements this youth has done and save them to Terrain on their behalf, then submit
	the stage for review. The Unit Council still approves it in Terrain.
</p>

<div class="controls">
	<div class="field">
		<label for="stage" class="form-label">Stage</label>
		<select
			id="stage"
			class="form-select"
			bind:value={selectedTemplateLink}
			onchange={loadStage}
			disabled={working}
		>
			<option value="">{loadingStages ? 'Loading stages...' : 'Select a stage'}</option>
			{#each stageOptions as option (option.templateLink)}
				<option value={option.templateLink}>{option.selectListItemText}</option>
			{/each}
		</select>
	</div>
	<label class="check"
		><input type="checkbox" class="form-check-input" bind:checked={showNonCoreOAS} /> Include non-core
		OAS</label
	>
	<a href={pagePath(`progress/${memberId}/`)} class="btn btn-outline-secondary">Back to progress</a>
</div>

{#if message}
	<div class="alert {messageIsError ? 'alert-danger' : 'alert-success'}">{message}</div>
{/if}

{#if loading}
	<p class="muted">Loading the stage from Terrain...</p>
{:else if record}
	<section class="card">
		<div class="card-head">
			<strong>{stageTitle}</strong>
			<span class="badge status">{statusDisplay(status)}</span>
		</div>
		<div class="small muted">{doneCount} of {record.statements.length} done in Terrain</div>

		{#if !canEdit}
			<div class="alert alert-info small">
				This stage is {statusDisplay(status).toLowerCase()}, so it can't be changed here.
			</div>
		{:else}
			{#if !canVerifyStatements}
				<div class="alert alert-warning small">
					Adult leaders can't verify Stage {MAX_LEADER_VERIFIABLE_STAGE + 1} and above. Statements need
					to be verified in Terrain by a suitable verifier.
				</div>
			{/if}
			{#if !isPreviousStageComplete(record.stage.stage, record.completedStagesInStream)}
				<div class="alert alert-warning small">
					Stage {record.stage.stage - 1} of this stream isn't complete in Terrain yet.
				</div>
			{/if}
			{#if !canReceiveCredit(record.stage.stage, record.completedStagesInStream)}
				<div class="alert alert-warning small">
					Terrain won't accept a submission for Stage {record.stage.stage} until Stage {record.stage
						.stage - 3} is complete. Statements can still be saved.
				</div>
			{/if}
		{/if}

		{#each groupBy(record.statements, (s) => s.group) as group (group.key)}
			<h4 class="group-title">{group.key}</h4>
			<ul class="statement-list">
				{#each group.items as statement (statement.inputId)}
					<li class:done={statement.alreadyDone}>
						<input
							id="st-{statement.inputId}"
							type="checkbox"
							class="form-check-input"
							checked={statement.alreadyDone || ticked.includes(statement.inputId)}
							disabled={!canTick(statement) || working}
							onchange={(e) => toggle(statement, e.currentTarget.checked)}
						/>
						<label for="st-{statement.inputId}">
							{statement.label}
							{#if statement.alreadyDone && statement.verifiedBy}
								<small class="muted">
									- verified by {statement.verifiedBy} {statement.verifiedDate}</small
								>
							{:else if ticked.includes(statement.inputId)}
								<small class="to-save"> - to save</small>
							{/if}
						</label>
					</li>
				{/each}
			</ul>
		{/each}

		{#if canEdit}
			<div class="verifier">
				<div class="field">
					<label class="form-label small" for="verifierName">Verifier name</label>
					<input
						id="verifierName"
						class="form-control"
						bind:value={verifier.name}
						disabled={working}
					/>
				</div>
				<div class="field">
					<label class="form-label small" for="verifierContact">Verifier email or phone</label>
					<input
						id="verifierContact"
						class="form-control"
						bind:value={verifier.contact}
						disabled={working}
					/>
				</div>
			</div>
			<div class="small muted">Recorded in Terrain as verified by a Scout member, dated today.</div>

			<div class="button-row">
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					onclick={tickAllRemaining}
					disabled={working}>Tick all remaining</button
				>
				<button
					type="button"
					class="btn btn-sm btn-primary"
					onclick={startSave}
					disabled={working || ticked.length === 0}>Save {ticked.length} to Terrain</button
				>
				<button
					type="button"
					class="btn btn-sm btn-success"
					onclick={startSubmit}
					disabled={working || !readyToSubmit}>Submit for review</button
				>
				{#if !readyToSubmit && ticked.length === 0}
					<span class="small muted"
						>Submitting needs every statement, including the logbook, saved first.</span
					>
				{/if}
			</div>

			{#if confirmingSave}
				<div class="confirm-box">
					<strong>Save to Terrain as {member?.firstName}?</strong>
					<p class="small">
						Beacon will switch to {member?.firstName}'s profile, add these {plural(
							newlyTicked.length,
							'statement'
						)} to {stageTitle}, then switch back. Nothing already recorded is changed.
					</p>
					<ul class="small">
						{#each newlyTicked as statement (statement.inputId)}
							<li>{statement.label}</li>
						{/each}
					</ul>
					{#if newlyTicked.some((s) => !s.isLogbook)}
						<p class="small">
							Verified by {verifier.name} ({verifier.contact}) on {dayMonthYear(today())}.
						</p>
					{/if}
					<button
						type="button"
						class="btn btn-sm btn-primary"
						onclick={confirmSave}
						disabled={working}>{working ? 'Saving...' : 'Yes, save'}</button
					>
					<button
						type="button"
						class="btn btn-sm btn-outline-secondary"
						onclick={() => (confirmingSave = false)}
						disabled={working}>Cancel</button
					>
				</div>
			{/if}

			{#if confirmingSubmit}
				<div class="confirm-box">
					<strong>Submit {stageTitle} for review?</strong>
					<p class="small">
						Beacon will submit it on {member?.firstName}'s behalf. It then goes to the Unit Council
						to approve in Terrain, and can't be changed here while it's waiting.
					</p>
					<button
						type="button"
						class="btn btn-sm btn-success"
						onclick={confirmSubmit}
						disabled={working}>{working ? 'Submitting...' : 'Yes, submit'}</button
					>
					<button
						type="button"
						class="btn btn-sm btn-outline-secondary"
						onclick={() => (confirmingSubmit = false)}
						disabled={working}>Cancel</button
					>
				</div>
			{/if}
		{/if}
	</section>
{/if}

<style>
	.intro {
		margin-bottom: 1rem;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1.25rem;
		margin-bottom: 1rem;
	}

	.controls .field {
		flex: 1 1 18rem;
		margin-bottom: 0;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
	}

	.status {
		background: var(--faint);
		font-weight: 500;
	}

	.statement-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.statement-list li {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border-soft);
	}

	.statement-list li input {
		flex-shrink: 0;
		width: 1.3rem;
		height: 1.3rem;
		margin-top: 0.05rem;
	}

	.statement-list li label {
		flex: 1;
		cursor: pointer;
	}

	.statement-list li.done label {
		color: var(--muted);
	}

	.to-save {
		color: var(--link);
	}

	.verifier {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 0 1rem;
		margin-top: 1rem;
	}

	.verifier .field {
		margin-bottom: 0.25rem;
	}

	.button-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.confirm-box {
		margin-top: 1rem;
		padding: 0.75rem 0.9rem;
		border: 1px solid #ffc107;
		border-radius: 0.4rem;
		background: #fffbea;
	}

	.confirm-box p {
		margin: 0.4rem 0 0.5rem;
	}

	@media (prefers-color-scheme: dark) {
		.confirm-box {
			border-color: #8a6d1c;
			background: #332a12;
		}
	}
</style>
