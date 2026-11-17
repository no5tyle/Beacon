<!--
	SIA plan: start or carry on a youth's special interest area plan, with the questions Terrain's plan
	template asks, save it, and submit it for the Unit Council's approval, as Terrain's own page does.
	Leaders pick the youth first; a youth plans their own and submits it in Terrain. The review, once the
	plan is approved, is still done in Terrain.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import BackLink from '#lib/components/BackLink.svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import StepBar from '#lib/components/StepBar.svelte';
	import {
		AREA_INPUT,
		answersOf,
		isPlanEditable,
		isRequired,
		missingRequired,
		projectName,
		siaAreaName,
		siaStatusDisplay,
		type SIAAnswers,
		type SIARecord,
		type SIATemplate
	} from '#lib/model/siaPlan.js';
	import { asc, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, members, sia } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';

	type Step = 'youth' | 'projects' | 'plan';

	let step = $state<Step>('youth');
	let youth = $state<MemberSummary[]>([]);
	let memberId = $state('');
	let projects = $state<SIARecord[]>([]);
	let template = $state<SIATemplate | null>(null);
	// The plan being written: its record once saved, and the form's answers
	let record = $state<SIARecord | null>(null);
	let answers = $state<SIAAnswers>({});
	let loading = $state(false);
	let working = $state('');
	let message = $state<{ text: string; isError: boolean } | null>(null);

	const unitId = $derived(app.unitId);
	const section = $derived(app.section);
	// Youth plan their own; leaders choose whose
	const steps = $derived<Step[]>(
		app.isYouth ? ['projects', 'plan'] : ['youth', 'projects', 'plan']
	);
	const stepNames: Record<Step, string> = { youth: 'Youth', projects: 'Projects', plan: 'Plan' };
	const name = (m: MemberSummary | undefined) => (m ? `${m.firstName} ${members.lastName(m)}` : '');
	const chosen = $derived(youth.find((y) => y.id === memberId));
	const whose = $derived(app.isYouth ? 'your' : `${chosen?.firstName ?? 'their'}'s`);
	const missing = $derived(template ? missingRequired(template, answers) : []);

	$effect(() => {
		const id = unitId;
		message = null;
		record = null;
		template = null;
		projects = [];
		if (!id) return;
		if (app.isYouth) {
			memberId = app.memberId;
			step = 'projects';
			void openProjects();
			return;
		}
		memberId = '';
		step = 'youth';
		loading = true;
		members
			.youth(id)
			.then((list) => {
				if (id === app.unitId)
					youth = sortBy(
						list,
						asc((m) => m.firstName),
						asc((m) => m.lastName)
					);
			})
			.catch(
				() => (message = { text: "Couldn't load the unit's youth from Terrain.", isError: true })
			)
			.finally(() => (loading = false));
	});

	async function openProjects() {
		if (!memberId) return;
		step = 'projects';
		message = null;
		loading = true;
		try {
			const [list, plan] = await Promise.all([sia.projects(memberId), sia.planTemplate(section)]);
			projects = list;
			template = plan;
		} catch {
			message = { text: "Couldn't load the projects from Terrain.", isError: true };
		}
		loading = false;
	}

	function openPlan(existing: SIARecord | null) {
		record = existing;
		answers = answersOf(existing);
		message = null;
		step = 'plan';
	}

	function back() {
		message = null;
		if (step === 'plan') step = 'projects';
		else if (step === 'projects') {
			step = 'youth';
			memberId = '';
		}
	}

	/** Saves the plan, and with submit, submits it for approval too, as Terrain's page does in one step */
	async function save(submit: boolean) {
		if (!template || working) return;
		if (missing.length > 0) {
			message = { text: `Fill in: ${missing.join(', ')}.`, isError: true };
			return;
		}
		working = submit ? 'submitting' : 'saving';
		message = null;
		const saved = await sia.savePlan(memberId, section, template, record, answers);
		if (!saved.ok) {
			working = '';
			message = { text: saved.message, isError: true };
			return;
		}
		record = saved.record;
		answers = answersOf(saved.record);
		if (!submit) {
			working = '';
			message = { text: 'Plan saved to Terrain. It isn’t submitted yet.', isError: false };
			return;
		}
		const submitted = await sia.submitPlan(memberId, saved.record);
		working = '';
		if (!submitted.ok) {
			message = { text: `Saved, but not submitted. ${submitted.message}`, isError: true };
			return;
		}
		record = submitted.record;
		message = {
			text: 'Submitted. It now waits for the Unit Council to approve the plan, on Approvals.',
			isError: false
		};
		projects = await sia.projects(memberId).catch(() => projects);
	}

	const editable = $derived(record === null || isPlanEditable(record));
</script>

<svelte:head>
	<title>Beacon / Plan an SIA</title>
</svelte:head>

<div class="sia-plan has-action-bar">
	<!-- Moving between OAS, activities and SIAs is for the start; within the flow, back is top left -->
	{#if step === steps[0]}
		<RecordSwitch />
	{:else}
		<BackLink label={stepNames[steps[steps.indexOf(step) - 1]]} onclick={back} />
	{/if}
	<h2>Plan an SIA</h2>
	<StepBar steps={steps.map((s) => stepNames[s])} current={steps.indexOf(step)} />

	{#if message}
		<div class="alert {message.isError ? 'alert-danger' : 'alert-success'}" role="status">
			{message.text}
		</div>
	{/if}

	{#if !unitId}
		<ChooseUnit />
	{:else if loading}
		<p class="muted">Loading from Terrain...</p>
	{:else if step === 'youth'}
		<p class="small muted">Whose special interest area project is it?</p>
		{#each youth as member (member.id)}
			<label class="pick-row">
				<input
					type="radio"
					name="youth"
					class="form-check-input"
					value={member.id}
					bind:group={memberId}
				/>
				<span class="grow">{name(member)}</span>
				{#if member.patrolName}<span class="small muted">{member.patrolName}</span>{/if}
			</label>
		{/each}
		<div class="action-bar">
			<span class="small muted">{chosen ? name(chosen) : 'No youth chosen'}</span>
			<button type="button" class="btn btn-primary" disabled={!memberId} onclick={openProjects}
				>Next: Projects</button
			>
		</div>
	{:else if step === 'projects'}
		<p class="small muted">
			{app.isYouth ? 'Your' : `${name(chosen)}'s`} special interest area projects. Carry on with a plan,
			or start a new one.
		</p>
		{#if projects.length === 0}
			<p class="muted">No projects yet.</p>
		{/if}
		<div class="card list">
			{#each projects as project (project.id)}
				{@const canEdit = isPlanEditable(project)}
				<svelte:element
					this={canEdit ? 'button' : 'div'}
					type={canEdit ? 'button' : undefined}
					class="project"
					class:editable={canEdit}
					role={canEdit ? undefined : 'group'}
					aria-label={projectName(project)}
					onclick={canEdit ? () => openPlan(project) : undefined}
				>
					<span class="grow">
						<span class="strong">{projectName(project)}</span>
						<span class="small muted"
							>{siaAreaName(String(project.answers?.[AREA_INPUT] ?? ''))} · {siaStatusDisplay(
								project
							)}</span
						>
					</span>
					{#if canEdit}<span class="chevron" aria-hidden="true">&rsaquo;</span>{/if}
				</svelte:element>
			{/each}
		</div>
		<div class="action-bar">
			<span class="small muted"
				>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span
			>
			<button
				type="button"
				class="btn btn-primary"
				disabled={!template}
				onclick={() => openPlan(null)}>New plan</button
			>
		</div>
	{:else if template}
		<div class="small muted subtitle">
			{app.isYouth ? 'Your plan' : name(chosen)}{record
				? ` · ${siaStatusDisplay(record)}`
				: ' · New plan'}
		</div>
		{#if !editable}
			<div class="alert alert-info small">
				This plan has been submitted, so it can't be changed here.
			</div>
		{/if}
		<form class="plan" onsubmit={(e) => e.preventDefault()}>
			<fieldset disabled={!editable || working !== ''}>
				{#each template.document as page (page.title)}
					<section class="plan-page" aria-label={page.title}>
						<h3>{page.title}</h3>
						{#each page.input_groups as group, g (g)}
							{#if group.title}<p class="small muted group-title">{group.title}</p>{/if}
							{#each group.inputs as input (input.id)}
								<div class="field">
									{#if input.type === 'single_tab_selector'}
										<span class="form-label">{input.label}</span>
										<div class="choices" role="group" aria-label={input.label.replace(/\*$/, '')}>
											{#each input.selections ?? [] as choice (choice.id)}
												<button
													type="button"
													class="btn {answers[input.id] === choice.id
														? 'btn-primary'
														: 'btn-outline-primary'}"
													aria-pressed={answers[input.id] === choice.id}
													onclick={() => (answers[input.id] = choice.id)}>{choice.title}</button
												>
											{/each}
										</div>
									{:else if input.type === 'radio'}
										<span class="form-label">{input.label}</span>
										<div class="radios">
											{#each input.selections ?? [] as choice (choice.id)}
												<label class="check">
													<input
														type="radio"
														class="form-check-input"
														name={input.id}
														value={choice.id}
														bind:group={answers[input.id]}
													/>
													{choice.title}
												</label>
											{/each}
										</div>
									{:else}
										<label class="form-label" for="sia-{input.id}">{input.label}</label>
										{#if input.id === 'project_name'}
											<input
												id="sia-{input.id}"
												class="form-control"
												placeholder={input.alt}
												required={isRequired(input)}
												bind:value={answers[input.id]}
											/>
										{:else}
											<textarea
												id="sia-{input.id}"
												class="form-control"
												rows="2"
												placeholder={input.alt}
												bind:value={answers[input.id]}></textarea>
										{/if}
									{/if}
								</div>
							{/each}
						{/each}
					</section>
				{/each}
			</fieldset>
		</form>

		{#if editable}
			<p class="small muted">
				Saved to {whose} record in Terrain{app.isYouth
					? ''
					: ', switching to their profile and back'}.
				{#if app.isYouth}Submit it for approval in Terrain once it's ready.{:else}Submitting sends
					it to the Unit Council to approve before the project starts.{/if}
			</p>
			<div class="action-bar">
				<button
					type="button"
					class="btn btn-outline-primary"
					disabled={working !== ''}
					onclick={() => save(false)}>{working === 'saving' ? 'Saving...' : 'Save'}</button
				>
				{#if !app.isYouth}
					<button
						type="button"
						class="btn btn-primary"
						disabled={working !== '' || missing.length > 0}
						onclick={() => save(true)}
						>{working === 'submitting' ? 'Submitting...' : 'Save and submit'}</button
					>
				{/if}
			</div>
		{:else}
			<div class="action-bar">
				<span class="small muted">{siaStatusDisplay(record!)}</span>
				<button type="button" class="btn btn-primary" onclick={() => goto(pagePath('approvals/'))}
					>Approvals</button
				>
			</div>
		{/if}
	{/if}
</div>

<style>
	.subtitle {
		margin-bottom: 0.5rem;
	}

	.list {
		padding-top: 0;
		padding-bottom: 0;
	}

	.list > * + * {
		border-top: 0.5px solid var(--border);
	}

	.project {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		padding: 0.6rem 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	.project .grow {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	.project.editable {
		cursor: pointer;
	}

	.chevron {
		color: var(--muted);
		font-size: 1.4rem;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.plan-page + .plan-page {
		margin-top: 1rem;
	}

	.plan-page h3 {
		margin-bottom: 0.25rem;
	}

	.group-title {
		margin: 0.25rem 0 0.5rem;
	}

	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.choices .btn {
		min-height: 48px;
	}

	.radios {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
	}

	.action-bar {
		gap: 0.5rem;
	}
</style>
