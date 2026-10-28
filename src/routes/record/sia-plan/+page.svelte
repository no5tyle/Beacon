<!--
	SIA plan: a leader enters a special interest area plan for a youth. Only the area and project name for
	now, the parts Terrain's requests have shown; the plan's other questions come once Terrain's plan
	template is captured. Saving to Terrain waits on its requests too, so the last step shows what would be
	saved.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import BackLink from '#lib/components/BackLink.svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import StepBar from '#lib/components/StepBar.svelte';
	import { newSIAPlan, SIA_AREAS, siaAreaName, siaPlanProblems } from '#lib/model/siaPlan.js';
	import { titleCase } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, members } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';

	type Step = 'youth' | 'plan' | 'review';
	const steps: Step[] = ['youth', 'plan', 'review'];
	const stepNames: Record<Step, string> = { youth: 'Youth', plan: 'Plan', review: 'Review' };

	let draft = $state(newSIAPlan());
	let step = $state<Step>('youth');
	let youth = $state<MemberSummary[]>([]);
	let loadingYouth = $state(false);
	let youthError = $state('');

	const unitId = $derived(app.unitId);
	const index = $derived(steps.indexOf(step));
	const problems = $derived(siaPlanProblems(draft));
	const name = (y: MemberSummary) => `${y.firstName} ${members.lastName(y)}`.trim();
	const chosen = $derived(youth.find((y) => y.id === draft.memberId));

	$effect(() => {
		// Plans are entered by leaders; a youth goes back to Home
		if (app.isYouth) goto(pagePath(''), { replaceState: true });
	});

	$effect(() => {
		const id = unitId;
		youth = [];
		draft.memberId = '';
		if (!id) return;
		loadingYouth = true;
		youthError = '';
		members
			.youth(id)
			.then((list) => {
				if (id === app.unitId) youth = list;
			})
			.catch(() => (youthError = "Couldn't load the unit's youth from Terrain."))
			.finally(() => (loadingYouth = false));
	});

	const canContinue = $derived(
		step === 'youth' ? !!draft.memberId : step === 'plan' ? problems.length === 0 : false
	);
	const next = () => (step = steps[Math.min(index + 1, steps.length - 1)]);
	const back = () => (step = steps[Math.max(index - 1, 0)]);
</script>

<svelte:head>
	<title>Beacon / Plan an SIA</title>
</svelte:head>

<div class="sia-plan has-action-bar">
	<!-- Moving between OAS, activities and SIAs is for the start; within the flow, back is top left -->
	{#if index > 0}
		<BackLink label={stepNames[steps[index - 1]]} onclick={back} />
	{:else}
		<RecordSwitch />
	{/if}
	<h2>Plan an SIA</h2>
	<StepBar steps={steps.map((s) => stepNames[s])} current={index} />

	{#if !unitId}
		<ChooseUnit />
	{:else if step === 'youth'}
		<p class="small muted">Whose special interest area plan is it?</p>
		{#if loadingYouth}
			<p class="muted">Loading the unit's youth...</p>
		{:else if youthError}
			<div class="alert alert-danger">{youthError}</div>
		{:else}
			{#each youth as member (member.id)}
				<label class="pick-row">
					<input
						type="radio"
						name="youth"
						class="form-check-input"
						value={member.id}
						bind:group={draft.memberId}
					/>
					<span class="grow">{name(member)}</span>
					{#if member.patrolName}<span class="small muted">{member.patrolName}</span>{/if}
				</label>
			{/each}
		{/if}
	{:else if step === 'plan'}
		<div class="small muted subtitle">{chosen ? name(chosen) : ''} · {titleCase(app.section)}</div>
		<div class="field">
			<span class="form-label">Special interest area</span>
			<div class="areas" role="group" aria-label="Special interest area">
				{#each SIA_AREAS as area (area.id)}
					<button
						type="button"
						class="btn {draft.area === area.id ? 'btn-primary' : 'btn-outline-primary'}"
						aria-pressed={draft.area === area.id}
						onclick={() => (draft.area = area.id)}>{area.name}</button
					>
				{/each}
			</div>
		</div>
		<div class="field">
			<label class="form-label" for="projectName">Project name</label>
			<input
				id="projectName"
				class="form-control"
				placeholder="e.g. Bracelet making business"
				bind:value={draft.projectName}
			/>
		</div>
		<div class="alert alert-info small">
			Terrain's plan asks more than this. Its other questions will appear here once Beacon has
			Terrain's plan template.
		</div>
	{:else}
		<div class="review">
			<h3>{draft.projectName}</h3>
			<dl>
				<dt>Youth</dt>
				<dd>{chosen ? name(chosen) : ''}</dd>
				<dt>Area</dt>
				<dd>{siaAreaName(draft.area)}</dd>
				<dt>Section</dt>
				<dd>{titleCase(app.section)}</dd>
			</dl>
		</div>
		<div class="alert alert-info small">
			Saving to Terrain is coming. Beacon needs Terrain's requests for starting a plan and
			submitting it for review first, so nothing is sent yet.
		</div>
	{/if}

	{#if unitId}
		<div class="action-bar">
			<span class="small muted">{chosen ? name(chosen) : 'No youth chosen'}</span>
			{#if step === 'review'}
				<button type="button" class="btn btn-primary" disabled title="Not connected to Terrain yet"
					>Save to Terrain</button
				>
			{:else}
				<button type="button" class="btn btn-primary" disabled={!canContinue} onclick={next}
					>Next: {stepNames[steps[index + 1]]}</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.subtitle {
		margin-bottom: 0.5rem;
	}

	.areas {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.areas .btn {
		min-height: 48px;
	}

	.review dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 1rem;
	}

	.review dt {
		color: var(--muted);
		font-weight: normal;
	}

	.review dd {
		margin: 0;
	}
</style>
