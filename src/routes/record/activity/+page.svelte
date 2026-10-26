<!--
	Log activity: a unit programme activity (a unit night, outing, camp or hike), who came and in what role,
	and the nights camped and kilometres hiked for their logbooks. Saved to the unit's programme in Terrain
	as a planned activity; the logbook figures aren't sent yet.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import {
		ACTIVITY_TYPES,
		activityProblems,
		attendanceSummary,
		CHALLENGE_AREAS,
		hasLogbook,
		logbookOf,
		newActivity,
		nightsBetween,
		ROLES,
		withType,
		type ActivityType,
		type Role
	} from '#lib/model/activity.js';
	import { pagePath } from '#lib/paths.js';
	import { activities, app, members } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';

	type Step = 'details' | 'attendance' | 'logbook' | 'review';

	let draft = $state(newActivity());
	let step = $state<Step>('details');
	let youth = $state<MemberSummary[]>([]);
	let loadingYouth = $state(false);
	let youthError = $state('');
	let saving = $state(false);
	let saved = $state('');
	let saveError = $state('');

	const unitId = $derived(app.unitId);
	const steps = $derived<Step[]>(
		hasLogbook(draft.type)
			? ['details', 'attendance', 'logbook', 'review']
			: ['details', 'attendance', 'review']
	);
	const stepNames: Record<Step, string> = {
		details: 'Activity',
		attendance: 'Who came',
		logbook: 'Logbook',
		review: 'Review'
	};
	const problems = $derived(activityProblems(draft));
	const came = $derived(youth.filter((y) => draft.attendance[y.id]));
	const name = (y: MemberSummary) => `${y.firstName} ${members.lastName(y)}`.trim();

	$effect(() => {
		// Activities are logged by leaders; a youth goes back to Home
		if (app.isYouth) goto(pagePath(''), { replaceState: true });
	});

	$effect(() => {
		const id = unitId;
		youth = [];
		draft.attendance = {};
		draft.logbookFor = {};
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

	function chooseType(type: ActivityType) {
		draft = withType(draft, type);
	}

	function changeDates() {
		if (draft.type === 'Camp') draft.nights = nightsBetween(draft.startDate, draft.endDate);
	}

	function toggle(member: MemberSummary, checked: boolean) {
		if (checked) draft.attendance[member.id] = 'Participant';
		else {
			delete draft.attendance[member.id];
			delete draft.logbookFor[member.id];
		}
	}

	function selectAll() {
		const all = youth.every((y) => draft.attendance[y.id]);
		draft.attendance = all
			? {}
			: Object.fromEntries(youth.map((y) => [y.id, draft.attendance[y.id] ?? 'Participant']));
		if (all) draft.logbookFor = {};
	}

	function setRole(member: MemberSummary, role: Role) {
		draft.attendance[member.id] = role;
	}

	/** One youth's nights or kilometres, kept only where they differ from everyone's */
	function setOwn(member: MemberSummary, field: 'nights' | 'kilometres', value: number) {
		const own = { ...logbookOf(draft, member.id), [field]: value };
		if (own.nights === draft.nights && own.kilometres === draft.kilometres)
			delete draft.logbookFor[member.id];
		else draft.logbookFor[member.id] = own;
	}

	async function save() {
		if (saving || problems.length > 0) return;
		saving = true;
		saveError = '';
		const result = await activities.save($state.snapshot(draft), unitId);
		saving = false;
		if (result.success) saved = draft.title.trim();
		else
			saveError =
				result.status > 0
					? `Terrain didn't accept the activity (response ${result.status}). Check Terrain's programme before trying again.`
					: result.body || "Couldn't save the activity. Try again in a moment.";
	}

	function logAnother() {
		draft = newActivity();
		step = 'details';
		saved = '';
		saveError = '';
	}

	const index = $derived(steps.indexOf(step));
	const next = () => (step = steps[Math.min(index + 1, steps.length - 1)]);
	const back = () => (step = steps[Math.max(index - 1, 0)]);

	// What each step needs before moving on
	const canContinue = $derived(
		step === 'details'
			? !!draft.title.trim() &&
					!!draft.challengeArea &&
					!problems.includes('It needs to end after it starts.')
			: step === 'attendance'
				? came.length > 0
				: step === 'logbook'
					? draft.nights >= 0 && draft.kilometres >= 0
					: false
	);

	const when = $derived(
		draft.startDate === draft.endDate
			? `${draft.startDate}, ${draft.startTime} to ${draft.endTime}`
			: `${draft.startDate} ${draft.startTime} to ${draft.endDate} ${draft.endTime}`
	);
</script>

<svelte:head>
	<title>Beacon / Log activity</title>
</svelte:head>

<div class="activity has-action-bar">
	<RecordSwitch />
	<h2>Log activity</h2>
	<ol class="steps">
		{#each steps as s, i (s)}
			<li class={s === step ? 'current' : i < index ? 'done' : ''}>{stepNames[s]}</li>
		{/each}
	</ol>

	{#if !unitId}
		<ChooseUnit />
	{:else if saved}
		<div class="alert alert-success" role="status">
			Saved {saved} to the unit's programme in Terrain as a planned activity.
		</div>
		<p class="small muted">
			Terrain gives milestone credit once an activity is concluded there. Beacon can't do that part
			yet.
		</p>
		<button type="button" class="btn btn-primary" onclick={logAnother}>Log another activity</button>
	{:else if step === 'details'}
		<div class="field">
			<span class="form-label">Type</span>
			<div class="chip-group" role="group" aria-label="Type">
				{#each ACTIVITY_TYPES as type (type)}
					<button
						type="button"
						class="btn chip {draft.type === type ? 'btn-primary' : 'btn-outline-primary'}"
						aria-pressed={draft.type === type}
						onclick={() => chooseType(type)}>{type}</button
					>
				{/each}
			</div>
		</div>
		<div class="field">
			<label class="form-label" for="title">Title</label>
			<input
				id="title"
				class="form-control"
				placeholder={draft.type === 'Camp' ? 'e.g. Spring camp' : 'e.g. Knots and lashings'}
				bind:value={draft.title}
			/>
		</div>
		<div class="field-row">
			<div class="field">
				<label class="form-label" for="startDate">Starts</label>
				<input
					id="startDate"
					type="date"
					class="form-control"
					bind:value={draft.startDate}
					onchange={changeDates}
				/>
			</div>
			<div class="field">
				<label class="form-label visually-hidden" for="startTime">Start time</label>
				<input id="startTime" type="time" class="form-control" bind:value={draft.startTime} />
			</div>
		</div>
		<div class="field-row">
			<div class="field">
				<label class="form-label" for="endDate">Ends</label>
				<input
					id="endDate"
					type="date"
					class="form-control"
					bind:value={draft.endDate}
					onchange={changeDates}
				/>
			</div>
			<div class="field">
				<label class="form-label visually-hidden" for="endTime">End time</label>
				<input id="endTime" type="time" class="form-control" bind:value={draft.endTime} />
			</div>
		</div>
		{#if problems.includes('It needs to end after it starts.')}
			<div class="small text-danger">It needs to end after it starts.</div>
		{/if}
		<div class="field">
			<label class="form-label" for="location">Where <span class="muted">(optional)</span></label>
			<input id="location" class="form-control" bind:value={draft.location} />
		</div>
		<div class="field">
			<span class="form-label">Challenge area</span>
			<div class="chip-group" role="group" aria-label="Challenge area">
				{#each CHALLENGE_AREAS as area (area)}
					<button
						type="button"
						class="btn chip {draft.challengeArea === area ? 'btn-primary' : 'btn-outline-primary'}"
						aria-pressed={draft.challengeArea === area}
						onclick={() => (draft.challengeArea = area)}>{area}</button
					>
				{/each}
			</div>
			<div class="small muted">Milestones count each youth's activities in this area.</div>
		</div>
	{:else if step === 'attendance'}
		<div class="small muted subtitle">{draft.title} · {draft.type}</div>
		{#if loadingYouth}
			<p class="muted">Loading the unit's youth...</p>
		{:else if youthError}
			<div class="alert alert-danger">{youthError}</div>
		{:else}
			<div class="heading-row">
				<strong>Who came</strong>
				<button type="button" class="btn btn-link btn-sm" onclick={selectAll}
					>{youth.every((y) => draft.attendance[y.id]) ? 'Clear all' : 'Everyone'}</button
				>
			</div>
			<p class="small muted">
				Tick who came, and set who assisted or led: milestones count each role.
			</p>
			{#each youth as member (member.id)}
				{@const role = draft.attendance[member.id]}
				<div class="attendee" class:came={!!role}>
					<label class="pick-row">
						<input
							type="checkbox"
							class="form-check-input"
							checked={!!role}
							onchange={(e) => toggle(member, e.currentTarget.checked)}
						/>
						<span class="grow">{name(member)}</span>
						{#if member.patrolName}<span class="small muted">{member.patrolName}</span>{/if}
					</label>
					{#if role}
						<div class="roles" role="group" aria-label="{name(member)}'s role">
							{#each ROLES as option (option)}
								<button
									type="button"
									class="btn btn-sm {role === option ? 'btn-primary' : 'btn-outline-secondary'}"
									aria-pressed={role === option}
									onclick={() => setRole(member, option)}>{option}</button
								>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	{:else if step === 'logbook'}
		<div class="small muted subtitle">{draft.title} · {attendanceSummary(draft.attendance)}</div>
		<p class="small muted">
			These go in the logbook of everyone who came. Change anyone who left early or joined late
			below.
		</p>
		<div class="field-row">
			<div class="field">
				<label class="form-label" for="nights">Nights camped</label>
				<input
					id="nights"
					type="number"
					min="0"
					inputmode="numeric"
					class="form-control"
					bind:value={draft.nights}
				/>
			</div>
			<div class="field">
				<label class="form-label" for="kilometres">Kilometres hiked</label>
				<input
					id="kilometres"
					type="number"
					min="0"
					step="0.1"
					inputmode="decimal"
					class="form-control"
					bind:value={draft.kilometres}
				/>
			</div>
		</div>
		<details class="own-logbook">
			<summary>Different for some youth</summary>
			<table class="logbook-table">
				<thead>
					<tr><th>Youth</th><th>Nights</th><th>Km</th></tr>
				</thead>
				<tbody>
					{#each came as member (member.id)}
						{@const own = logbookOf(draft, member.id)}
						<tr class:differs={!!draft.logbookFor[member.id]}>
							<td>{name(member)}</td>
							<td
								><input
									type="number"
									min="0"
									class="form-control form-control-sm"
									aria-label="{name(member)}'s nights"
									value={own.nights}
									onchange={(e) => setOwn(member, 'nights', Number(e.currentTarget.value))}
								/></td
							>
							<td
								><input
									type="number"
									min="0"
									step="0.1"
									class="form-control form-control-sm"
									aria-label="{name(member)}'s kilometres"
									value={own.kilometres}
									onchange={(e) => setOwn(member, 'kilometres', Number(e.currentTarget.value))}
								/></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{:else}
		<div class="review">
			<h3>{draft.title}</h3>
			<dl>
				<dt>Type</dt>
				<dd>{draft.type}</dd>
				<dt>When</dt>
				<dd>{when}</dd>
				{#if draft.location}<dt>Where</dt>
					<dd>{draft.location}</dd>{/if}
				<dt>Challenge area</dt>
				<dd>{draft.challengeArea}</dd>
				<dt>Who came</dt>
				<dd>{attendanceSummary(draft.attendance)}</dd>
				{#if hasLogbook(draft.type)}
					<dt>Logbook</dt>
					<dd>
						{draft.nights}
						{draft.nights === 1 ? 'night' : 'nights'}, {draft.kilometres} km each{Object.keys(
							draft.logbookFor
						).length > 0
							? `, different for ${Object.keys(draft.logbookFor).length}`
							: ''}
					</dd>
				{/if}
			</dl>
			<ul class="small attendee-list">
				{#each came as member (member.id)}
					<li>
						{name(member)}{draft.attendance[member.id] !== 'Participant'
							? ` (${draft.attendance[member.id]})`
							: ''}
					</li>
				{/each}
			</ul>
		</div>
		{#if hasLogbook(draft.type) && (draft.nights > 0 || draft.kilometres > 0)}
			<div class="alert alert-info small">
				The nights and kilometres aren't sent to Terrain yet: Beacon doesn't know how Terrain
				records them. The activity, who came and their roles are.
			</div>
		{/if}
		{#if saveError}
			<div class="alert alert-danger" role="alert">{saveError}</div>
		{/if}
	{/if}

	{#if unitId && !saved}
		<div class="action-bar">
			{#if index > 0}
				<button type="button" class="btn btn-outline-secondary" disabled={saving} onclick={back}
					>Back</button
				>
			{:else}
				<span class="small muted">{draft.type}</span>
			{/if}
			{#if step === 'review'}
				<button
					type="button"
					class="btn btn-primary"
					disabled={saving || problems.length > 0}
					onclick={save}>{saving ? 'Saving...' : 'Save to Terrain'}</button
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
	.heading-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.5rem;
	}

	.subtitle {
		margin-bottom: 0.5rem;
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		align-items: end;
	}

	.attendee {
		border-bottom: 1px solid var(--border-soft);
	}

	.attendee .pick-row {
		border-bottom: 0;
	}

	.roles {
		display: flex;
		gap: 0.4rem;
		padding: 0 0 0.6rem 2.2rem;
	}

	.own-logbook summary {
		margin: 0.5rem 0;
		color: var(--link);
		cursor: pointer;
	}

	.logbook-table {
		width: 100%;
	}

	.logbook-table th,
	.logbook-table td {
		padding: 0.25rem;
	}

	.logbook-table td:not(:first-child) {
		width: 5.5rem;
	}

	.logbook-table tr.differs td:first-child {
		font-weight: 600;
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

	.attendee-list {
		columns: 2;
		padding-left: 1.2rem;
	}
</style>
