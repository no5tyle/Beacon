<!--
	Log an Activity: a unit programme activity, over one day or more, who came and who led it,
	the nights away and kilometres walked for their logbooks, and how it went. Only activities that are
	over: saved to the unit's programme in Terrain already concluded, with their review.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import StepBar from '#lib/components/StepBar.svelte';
	import {
		activityProblems,
		attendanceSummary,
		CHALLENGE_AREAS,
		NOT_OVER,
		newActivity,
		nightsOf,
		RATINGS,
		reviewProblems,
		SCOUT_METHOD,
		SPICES,
		TAGS,
		withMultiDay
	} from '#lib/model/activity.js';
	import { today } from '#lib/model/dates.js';
	import { pagePath } from '#lib/paths.js';
	import { readActivityTimes, writeActivityTimes } from '#lib/stores/storage.js';
	import { activities, app, members } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';

	type Step = 'details' | 'attendance' | 'logbook' | 'review' | 'save';

	let draft = $state(newActivity(undefined, new Date(), readActivityTimes()));
	let step = $state<Step>('details');
	let youth = $state<MemberSummary[]>([]);
	let loadingYouth = $state(false);
	let youthError = $state('');
	let saving = $state(false);
	// The title of what was saved, once it's in Terrain
	let saved = $state('');
	let saveError = $state('');

	const unitId = $derived(app.unitId);
	const steps = $derived<Step[]>(['details', 'attendance', 'logbook', 'review', 'save']);
	const stepNames: Record<Step, string> = {
		details: 'Activity',
		attendance: 'Who came',
		logbook: 'Logbook',
		review: 'How it went',
		save: 'Save'
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

	function setMultiDay(multiDay: boolean) {
		draft = withMultiDay(draft, multiDay, new Date(), readActivityTimes());
	}

	// One day ends the day it starts
	function changeStartDate() {
		if (!draft.multiDay) draft.endDate = draft.startDate;
	}

	function toggle(member: MemberSummary, checked: boolean) {
		if (checked) draft.attendance[member.id] = 'Participant';
		else delete draft.attendance[member.id];
	}

	function selectAll() {
		const all = youth.every((y) => draft.attendance[y.id]);
		draft.attendance = all
			? {}
			: Object.fromEntries(youth.map((y) => [y.id, draft.attendance[y.id] ?? 'Participant']));
	}

	function toggleLed(member: MemberSummary) {
		draft.attendance[member.id] =
			draft.attendance[member.id] === 'Leader' ? 'Participant' : 'Leader';
	}

	async function save() {
		if (saving || problems.length > 0) return;
		saving = true;
		saveError = '';
		const result = await activities.save($state.snapshot(draft), unitId);
		saving = false;
		if (result.success) {
			saved = draft.title.trim();
			// The next one-day activity starts with these times
			if (!draft.multiDay) writeActivityTimes({ start: draft.startTime, end: draft.endTime });
		} else
			saveError =
				result.status > 0
					? `Terrain didn't accept the activity (response ${result.status}). Check Terrain's programme before trying again.`
					: result.body || "Couldn't save the activity. Try again in a moment.";
	}

	function toggleIn(list: string[], id: string, on: boolean): string[] {
		return on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id);
	}

	function logAnother() {
		draft = newActivity(undefined, new Date(), readActivityTimes());
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
					!!draft.location.trim() &&
					!!draft.challengeArea &&
					!problems.includes('It needs to end after it starts.') &&
					!problems.includes(NOT_OVER)
			: step === 'attendance'
				? came.length > 0
				: step === 'logbook'
					? draft.kilometres >= 0
					: step === 'review'
						? reviewProblems(draft.review).length === 0
						: false
	);

	// e.g. "2 nights towards camping, 6 km walked, towards Walkabout"
	const logbookSummary = $derived(
		[
			nightsOf(draft) > 0
				? `${nightsOf(draft)} ${nightsOf(draft) === 1 ? 'night' : 'nights'} away${draft.camped ? ', towards camping' : ''}`
				: '',
			draft.kilometres > 0
				? `${draft.kilometres} km walked${draft.walkabout ? ', towards Walkabout' : ''}`
				: ''
		]
			.filter(Boolean)
			.join(', ') || 'Nothing'
	);

	const when = $derived(
		draft.startDate === draft.endDate
			? `${draft.startDate}, ${draft.startTime} to ${draft.endTime}`
			: `${draft.startDate} ${draft.startTime} to ${draft.endDate} ${draft.endTime}`
	);
</script>

<svelte:head>
	<title>Beacon / Log an Activity</title>
</svelte:head>

<div class="activity has-action-bar">
	<RecordSwitch />
	<h2>Log an Activity</h2>
	<StepBar steps={steps.map((s) => stepNames[s])} current={index} />

	{#if !unitId}
		<ChooseUnit />
	{:else if saved}
		<div class="alert alert-success" role="status">
			Saved {saved} to the unit's programme in Terrain, concluded, so those who came get credit for it.
		</div>
		<button type="button" class="btn btn-primary" onclick={logAnother}>Log another activity</button>
	{:else if step === 'details'}
		<div class="field">
			<label class="form-label" for="title">Title</label>
			<input
				id="title"
				class="form-control"
				placeholder={draft.multiDay ? 'e.g. Spring camp' : 'e.g. Knots and lashings'}
				bind:value={draft.title}
			/>
		</div>
		<label class="pick-row multi-day">
			<input
				type="checkbox"
				class="form-check-input"
				checked={draft.multiDay}
				onchange={(e) => setMultiDay(e.currentTarget.checked)}
			/>
			<span>Runs over more than one day, e.g. a camp</span>
		</label>
		<div class="field-row">
			<div class="field">
				<label class="form-label" for="startDate">{draft.multiDay ? 'Starts on' : 'Date'}</label>
				<input
					id="startDate"
					type="date"
					max={today()}
					class="form-control"
					bind:value={draft.startDate}
					onchange={changeStartDate}
				/>
			</div>
			<div class="field">
				<label class="form-label" for="startTime">From</label>
				<input id="startTime" type="time" class="form-control" bind:value={draft.startTime} />
			</div>
		</div>
		<div class="field-row">
			{#if draft.multiDay}
				<div class="field">
					<label class="form-label" for="endDate">Ends on</label>
					<input
						id="endDate"
						type="date"
						max={today()}
						class="form-control"
						bind:value={draft.endDate}
					/>
				</div>
			{/if}
			<div class="field" class:end-time={!draft.multiDay}>
				<label class="form-label" for="endTime">To</label>
				<input id="endTime" type="time" class="form-control" bind:value={draft.endTime} />
			</div>
		</div>
		{#if problems.includes('It needs to end after it starts.')}
			<div class="small text-danger">It needs to end after it starts.</div>
		{:else if problems.includes(NOT_OVER)}
			<div class="small text-danger">{NOT_OVER}</div>
		{/if}
		<div class="field">
			<label class="form-label" for="location">Where</label>
			<input
				id="location"
				class="form-control"
				placeholder={draft.multiDay ? 'e.g. Woodhouse' : 'e.g. the hall'}
				bind:value={draft.location}
			/>
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
		<div class="small muted subtitle">{draft.title} · {when}</div>
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
				Tick who came: everyone ticked is recorded as participating. Mark any who led it too, as
				milestones count that as well.
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
						<button
							type="button"
							class="btn btn-sm led {role === 'Leader' ? 'btn-primary' : 'btn-outline-secondary'}"
							aria-pressed={role === 'Leader'}
							aria-label="{name(member)} led it"
							onclick={() => toggleLed(member)}>Led</button
						>
					{/if}
				</div>
			{/each}
		{/if}
	{:else if step === 'logbook'}
		<div class="small muted subtitle">{draft.title} · {attendanceSummary(draft.attendance)}</div>
		<p class="small muted">These go in the logbook of everyone who came.</p>
		{#if nightsOf(draft) > 0}
			<div class="nights">
				<strong>{nightsOf(draft)} {nightsOf(draft) === 1 ? 'night' : 'nights'} away</strong>
				<div class="small muted">From the dates. Change the dates to change it.</div>
			</div>
			<label class="pick-row camped">
				<input type="checkbox" class="form-check-input" bind:checked={draft.camped} />
				<span>They camped, so the nights count towards camping</span>
			</label>
		{:else}
			<p class="small muted">
				No nights away. For a camp or overnight hike, tick "Runs over more than one day" on the
				first step.
			</p>
		{/if}
		<div class="field">
			<label class="form-label" for="kilometres"
				>Kilometres walked <span class="muted">(if they went walking)</span></label
			>
			<input
				id="kilometres"
				type="number"
				min="0"
				step="0.1"
				inputmode="decimal"
				class="form-control kilometres"
				bind:value={draft.kilometres}
			/>
		</div>
		{#if draft.kilometres > 0}
			<label class="pick-row">
				<input type="checkbox" class="form-check-input" bind:checked={draft.walkabout} />
				<span>Counts towards the Walkabout award</span>
			</label>
		{/if}
	{:else if step === 'review'}
		<div class="small muted subtitle">{draft.title} · {attendanceSummary(draft.attendance)}</div>
		<p class="small muted">Terrain concludes the activity with this review.</p>
		<div class="field">
			<span class="form-label">How did it go?</span>
			<div class="chip-group" role="group" aria-label="How did it go?">
				{#each RATINGS as rating (rating.id)}
					<button
						type="button"
						class="btn chip {draft.review.rating === rating.id
							? 'btn-primary'
							: 'btn-outline-primary'}"
						aria-pressed={draft.review.rating === rating.id}
						onclick={() => (draft.review.rating = rating.id)}>{rating.name}</button
					>
				{/each}
			</div>
		</div>
		<div class="field">
			<span class="form-label">What was it like? <span class="muted">(optional)</span></span>
			<div class="chip-group" role="group" aria-label="What was it like?">
				{#each TAGS as tag (tag.id)}
					{@const on = draft.review.tags.includes(tag.id)}
					<button
						type="button"
						class="btn chip {on ? 'btn-primary' : 'btn-outline-primary'}"
						aria-pressed={on}
						onclick={() => (draft.review.tags = toggleIn(draft.review.tags, tag.id, !on))}
						>{tag.name}</button
					>
				{/each}
			</div>
		</div>
		<fieldset class="field">
			<legend class="form-label">Scout method it used</legend>
			{#each SCOUT_METHOD as element (element.id)}
				<label class="pick-row">
					<input
						type="checkbox"
						class="form-check-input"
						checked={draft.review.method.includes(element.id)}
						onchange={(e) =>
							(draft.review.method = toggleIn(
								draft.review.method,
								element.id,
								e.currentTarget.checked
							))}
					/>
					<span>{element.name}</span>
				</label>
			{/each}
		</fieldset>
		<fieldset class="field">
			<legend class="form-label">SPICES it developed</legend>
			<div class="spices">
				{#each SPICES as area (area.id)}
					<label class="pick-row">
						<input
							type="checkbox"
							class="form-check-input"
							checked={draft.review.spices.includes(area.id)}
							onchange={(e) =>
								(draft.review.spices = toggleIn(
									draft.review.spices,
									area.id,
									e.currentTarget.checked
								))}
						/>
						<span>{area.name}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{:else}
		<div class="review">
			<h3>{draft.title}</h3>
			<dl>
				<dt>When</dt>
				<dd>{when}</dd>
				<dt>Where</dt>
				<dd>{draft.location}</dd>
				<dt>Challenge area</dt>
				<dd>{draft.challengeArea}</dd>
				<dt>Who came</dt>
				<dd>{attendanceSummary(draft.attendance)}</dd>
				<dt>How it went</dt>
				<dd>{RATINGS.find((r) => r.id === draft.review.rating)?.name ?? ''}</dd>
				<dt>Logbook</dt>
				<dd>{logbookSummary}</dd>
			</dl>
			<ul class="small attendee-list">
				{#each came as member (member.id)}
					<li>
						{name(member)}{draft.attendance[member.id] === 'Leader' ? ' (led)' : ''}
					</li>
				{/each}
			</ul>
		</div>
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
				<span class="small muted">{draft.multiDay ? 'Over more than one day' : 'One day'}</span>
			{/if}
			{#if step === 'save'}
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

	fieldset.field {
		margin: 0 0 1rem;
		padding: 0;
		border: 0;
	}

	.spices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 1rem;
	}

	.multi-day {
		margin-bottom: 0.75rem;
	}

	.end-time {
		grid-column: 2;
	}

	.camped {
		margin-bottom: 0.75rem;
	}

	.nights {
		margin-bottom: 1rem;
	}

	.kilometres {
		max-width: 10rem;
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

	.led {
		margin: 0 0 0.6rem 2.2rem;
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
