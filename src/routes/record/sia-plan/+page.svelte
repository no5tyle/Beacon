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
		templatePart,
		isReviewEditable,
		type SIAAnswers,
		type SIARecord,
		type SIATemplate
	} from '#lib/model/siaPlan.js';
	import { SECTION_ORDER } from '#lib/model/insights/sectionFlow.js';
	import { asc, desc, sortBy, titleCase } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, members, sia } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';

	// The plan in two steps: its required questions, then the optional ones. Once the plan is approved,
	// the review, a step of its own
	type Step = 'youth' | 'projects' | 'plan' | 'details' | 'review';

	let step = $state<Step>('youth');
	let youth = $state<MemberSummary[]>([]);
	let memberId = $state('');
	let projects = $state<SIARecord[]>([]);
	let template = $state<SIATemplate | null>(null);
	let reviewTemplate = $state<SIATemplate | null>(null);
	// The plan being written: its record once saved, and the form's answers
	let record = $state<SIARecord | null>(null);
	let answers = $state<SIAAnswers>({});
	let loading = $state(false);
	let working = $state('');
	let message = $state<{ text: string; isError: boolean } | null>(null);

	const unitId = $derived(app.unitId);
	const section = $derived(app.section);
	// Youth plan their own; leaders choose whose
	const steps = $derived<Step[]>([
		...(app.isYouth ? [] : (['youth'] as Step[])),
		'projects',
		...(step === 'review' ? (['review'] as Step[]) : (['plan', 'details'] as Step[]))
	]);
	const stepNames: Record<Step, string> = {
		youth: 'Youth',
		projects: 'Projects',
		plan: 'Plan',
		details: 'Details',
		review: 'Review'
	};
	const reviewing = $derived(step === 'review');
	const name = (m: MemberSummary | undefined) => (m ? `${m.firstName} ${members.lastName(m)}` : '');
	const chosen = $derived(youth.find((y) => y.id === memberId));
	const whose = $derived(app.isYouth ? 'your' : `${chosen?.firstName ?? 'their'}'s`);
	// The review asks nothing required; the plan its area and name
	const missing = $derived(template && step !== 'review' ? missingRequired(template, answers) : []);

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
			const [list, plan, review] = await Promise.all([
				sia.projects(memberId),
				sia.planTemplate(section),
				sia.reviewTemplate(section)
			]);
			projects = list;
			template = plan;
			reviewTemplate = review;
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

	function openReview(existing: SIARecord) {
		record = existing;
		answers = answersOf(existing);
		message = null;
		step = 'review';
	}

	function back() {
		message = null;
		if (step === 'details') step = 'plan';
		else if (step === 'review') step = 'projects';
		else if (step === 'plan') step = 'projects';
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
			message = {
				text: `${reviewing ? 'Review' : 'Plan'} saved to Terrain. It isn’t submitted yet.`,
				isError: false
			};
			return;
		}
		const submitted = await sia.submitPlan(memberId, saved.record, reviewing ? 'review' : 'plan');
		working = '';
		if (!submitted.ok) {
			message = { text: `Saved, but not submitted. ${submitted.message}`, isError: true };
			return;
		}
		record = submitted.record;
		message = {
			text: reviewing
				? 'Submitted. The review now waits for the Unit Council, on Approvals.'
				: 'Submitted. It now waits for the Unit Council to approve the plan, on Approvals.',
			isError: false
		};
		projects = await sia.projects(memberId).catch(() => projects);
	}

	// The youth's projects in this section first; those from earlier sections (e.g. as a Cub, for a
	// Scout), each section apart, most recent section first
	const sectionName = (id: string) => (id ? `the ${titleCase(id)}s` : 'another section');
	const currentProjects = $derived(projects.filter((p) => !p.section || p.section === section));
	const earlierSections = $derived(
		sortBy(
			[...new Set(projects.map((p) => p.section ?? '').filter((id) => id && id !== section))],
			desc((id) => SECTION_ORDER.indexOf(id))
		).map((id) => ({ section: id, projects: projects.filter((p) => p.section === id) }))
	);

	const editable = $derived(
		reviewing
			? record !== null && isReviewEditable(record)
			: record === null || isPlanEditable(record)
	);
	// The questions for this step: the required ones first, then the optional ones on a page of their own.
	// A submitted plan shows them all at once, as it can't be changed. The review asks its own questions,
	// apart from attaching files, which is done in Terrain
	const shownPages = $derived(
		reviewing
			? (reviewTemplate?.document ?? []).map((page) => ({
					...page,
					title: page.title ?? 'Review',
					input_groups: page.input_groups.map((group) => ({
						...group,
						inputs: group.inputs.filter((input) => input.type !== 'file_uploader')
					}))
				}))
			: !template
				? []
				: !editable
					? template.document
					: templatePart(template, step === 'plan')
	);

	function toDetails() {
		if (missing.length > 0) {
			message = { text: `Fill in: ${missing.join(', ')}.`, isError: true };
			return;
		}
		message = null;
		step = 'details';
		window.scrollTo(0, 0);
	}
</script>

<svelte:head>
	<title>Beacon / Manage SIAs</title>
</svelte:head>

{#snippet projectList(list: SIARecord[], current = true)}
	<div class="card list">
		{#each list as project (project.id)}
			{@const canReview = current && isReviewEditable(project)}
			{@const canEdit = current && (isPlanEditable(project) || canReview)}
			<svelte:element
				this={canEdit ? 'button' : 'div'}
				type={canEdit ? 'button' : undefined}
				class="project"
				class:editable={canEdit}
				role={canEdit ? undefined : 'group'}
				aria-label={projectName(project)}
				onclick={canEdit ? () => (canReview ? openReview(project) : openPlan(project)) : undefined}
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
{/snippet}

<div class="sia-plan has-action-bar">
	<!-- Moving between OAS, activities and SIAs is for the start; within the flow, back is top left -->
	{#if step === steps[0]}
		<RecordSwitch />
	{:else}
		<BackLink label={stepNames[steps[steps.indexOf(step) - 1]]} onclick={back} />
	{/if}
	<h2>Manage SIAs</h2>
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
		<p class="small muted">Whose special interest area projects? Choose a youth to see them.</p>
		<!-- A tap opens the youth's projects straight away -->
		<div class="card list">
			{#each youth as member (member.id)}
				<button
					type="button"
					class="project youth-row"
					onclick={() => {
						memberId = member.id;
						void openProjects();
					}}
				>
					<span class="grow">
						<span class="strong">{name(member)}</span>
						{#if member.patrolName}<span class="small muted">{member.patrolName}</span>{/if}
					</span>
					<span class="chevron" aria-hidden="true">&rsaquo;</span>
				</button>
			{/each}
		</div>
	{:else if step === 'projects'}
		<p class="small muted">
			{app.isYouth ? 'Your' : `${name(chosen)}'s`} special interest area projects. Carry on with a plan,
			or start a new one.
		</p>
		{#if projects.length === 0}
			<p class="muted">No projects yet.</p>
		{/if}
		{#if currentProjects.length > 0}
			{@render projectList(currentProjects)}
		{:else if projects.length > 0}
			<p class="muted">No projects in the {sectionName(section)} yet.</p>
		{/if}
		{#each earlierSections as earlier (earlier.section)}
			<h3 class="earlier-heading">From {sectionName(earlier.section)}</h3>
			<p class="small muted earlier-note">
				These belong to {sectionName(earlier.section)}, so they can only be viewed here.
			</p>
			{@render projectList(earlier.projects, false)}
		{/each}
		<div class="action-bar">
			<span class="small muted"
				>{currentProjects.length} {currentProjects.length === 1 ? 'project' : 'projects'}</span
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
			{app.isYouth ? (reviewing ? 'Your review' : 'Your plan') : name(chosen)}{record
				? ` · ${siaStatusDisplay(record)}`
				: ' · New plan'}
		</div>
		{#if editable}
			<!-- What's recorded here belongs to the open unit's section, and goes to its Unit Council -->
			<div class="alert alert-warning small section-note" role="note">
				This {reviewing ? 'review' : 'plan'} is for {app.unitName || 'this unit'}, in {sectionName(
					section
				)}: it goes to their Unit Council. Check that's the section {app.isYouth
					? "you're"
					: `${chosen?.firstName ?? 'the youth'} is`} in now; for another, switch unit first.
			</div>
		{/if}
		{#if !editable}
			<div class="alert alert-info small">
				This plan has been submitted, so it can't be changed here.
			</div>
		{:else if reviewing}
			<div class="alert alert-info small optional-note">
				{projectName(record!)}: the plan is approved, so it's time to look back on it. Every
				question is optional. Photos or other files are attached in Terrain.
			</div>
		{:else if step === 'plan' && !record}
			<div class="alert alert-warning small undo-note" role="note">
				Saving starts this project on {whose} record in Terrain, and it can't be undone: Beacon has no
				way to delete or archive it.
			</div>
		{:else if step === 'details'}
			<div class="alert alert-info small optional-note">
				Everything on this page is optional. Answer what helps the plan, and leave the rest blank.
			</div>
		{/if}
		<form class="plan" onsubmit={(e) => e.preventDefault()}>
			<fieldset disabled={!editable || working !== ''}>
				{#each shownPages as page, p (p)}
					<section class="plan-page" aria-label={page.title ?? 'Review'}>
						{#if page.title}<h3>{page.title}</h3>{/if}
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

		{#if editable && step === 'plan'}
			<div class="action-bar">
				<button
					type="button"
					class="btn btn-outline-primary"
					disabled={working !== ''}
					onclick={() => save(false)}>{working === 'saving' ? 'Saving...' : 'Save'}</button
				>
				<button type="button" class="btn btn-primary" disabled={working !== ''} onclick={toDetails}
					>Next: Details</button
				>
			</div>
		{:else if editable}
			<p class="small muted">
				Saved to {whose} record in Terrain{app.isYouth
					? ''
					: ', switching to their profile and back'}.
				{#if app.isYouth}Submit it in Terrain once it's ready.{:else if reviewing}Submitting sends
					the review to the Unit Council, to complete the project.{:else}Submitting sends it to the
					Unit Council to approve before the project starts.{/if}
			</p>
			{#if !app.isYouth}
				<div class="alert alert-warning small undo-note" role="note">
					{record ? 'Submitting' : 'Saving starts this project in Terrain, and submitting'} can't be undone:
					Beacon can't take it back to a draft once it's with the Unit Council.
				</div>
			{/if}
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
	.earlier-heading {
		margin: 1.25rem 0 0.15rem;
		font-size: 1rem;
	}

	.earlier-note {
		margin-bottom: 0.5rem;
	}

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
