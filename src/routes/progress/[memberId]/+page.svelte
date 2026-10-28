<!--
	One youth's progress. A header says who they are and when they move up, four numbers sum them up, and
	three tabs hold the rest: Next steps (what they're missing and what to run next), Awards (milestones and
	the section's award) and Records (their OAS stages, special interest areas and logbook).
-->
<script lang="ts">
	import { page } from '$app/state';
	import BackLink from '#lib/components/BackLink.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { monthYear, shortDate } from '#lib/model/dates.js';
	import {
		milestoneRemaining,
		milestoneTotal,
		needRemaining,
		peakAwardPercent,
		percentDone,
		type ChallengeAreaNeed,
		type MemberInsightsReport
	} from '#lib/model/insights/memberModels.js';
	import { milestoneNeeds } from '#lib/model/insights/memberInsightsCalculator.js';
	import { readInsightsSettings } from '#lib/stores/storage.js';
	import { asc, desc, formatOneDecimal, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, insights, members, progress } from '#lib/services/index.js';
	import type {
		MilestoneLog,
		MilestoneSummary,
		OASSummary,
		ProgressDetails
	} from '#lib/services/progress.js';

	type Tab = 'next' | 'awards' | 'records';

	const memberId = $derived(page.params.memberId ?? '');

	let details = $state<ProgressDetails | null>(null);
	let loadError = $state('');
	let report = $state<MemberInsightsReport | null>(null);
	let insightsLoading = $state(false);
	let insightsError = $state('');
	let tab = $state<Tab>('next');
	let showFilters = $state(false);
	// Insights' filters from earlier in this tab: the moving up window and section rules, and where these start
	const saved = readInsightsSettings();
	// Non-core OAS streams are hidden unless the leader asks for them
	let showNonCoreOAS = $state(saved.includeNonCoreOAS);
	// Stages below where the section typically works are hidden unless asked for
	let showAllStages = $state(!saved.sectionStagesOnly);

	$effect(() => {
		const id = memberId;
		const unitId = app.unitId;
		details = null;
		report = null;
		loadError = '';
		progress
			.details(unitId, id)
			.then((loaded) => {
				if (id !== memberId) return;
				details = loaded;
				// Show the progress straight away, then fill in the insights which need extra OAS lookups
				loadInsights();
			})
			.catch(() => (loadError = "Couldn't load their progress from Terrain."));
	});

	async function loadInsights() {
		if (!details) return;
		insightsLoading = true;
		insightsError = '';
		try {
			report = await insights.memberReport(app.unitId, details, {
				...saved,
				includeNonCoreOAS: showNonCoreOAS,
				sectionStagesOnly: !showAllStages
			});
		} catch {
			insightsError = 'Unable to build insights for this member.';
		}
		insightsLoading = false;
	}

	const filterCount = $derived((showNonCoreOAS ? 1 : 0) + (showAllStages ? 1 : 0));

	const name = $derived(
		details ? `${details.member.firstName} ${members.lastName(details.member)}` : ''
	);

	/** Patrol, role and the like, under their name */
	const facts = $derived.by(() => {
		if (!details) return [];
		const m = details.member;
		return [
			m.patrolName,
			m.patrolDuty,
			m.unitCouncil ? 'Unit Council' : '',
			m.memberNumber ? `No. ${m.memberNumber}` : ''
		].filter(Boolean);
	});

	const movesUp = $derived(
		report?.moveUpDate ? `Moves up around ${monthYear(report.moveUpDate)}` : ''
	);

	const needWidth = (need: ChallengeAreaNeed) =>
		need.need === 0 ? 100 : Math.round(Math.min(100, (100 * need.have) / need.need));

	const AREAS = [
		{ key: 'community', name: 'Community' },
		{ key: 'outdoors', name: 'Outdoors' },
		{ key: 'creative', name: 'Creative' },
		{ key: 'personal_growth', name: 'Personal Growth' }
	];
	const AREA_NAMES: Record<string, string> = Object.fromEntries(AREAS.map((a) => [a.key, a.name]));

	const CORE_STREAMS = ['bushcraft', 'bushwalking', 'camping'];
	const NON_CORE_STREAMS = ['alpine', 'cycling', 'vertical', 'aquatics', 'boating', 'paddling'];
	const STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
	const oasStreams = $derived(
		showNonCoreOAS ? [...CORE_STREAMS, ...NON_CORE_STREAMS] : CORE_STREAMS
	);
	const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

	// OAS records note the section a stage was done in by its first letter
	const SECTIONS: Record<string, string> = {
		j: 'Joeys',
		c: 'Cubs',
		s: 'Scouts',
		v: 'Venturers',
		r: 'Rovers'
	};
	const thisSection = $derived(app.section.toLowerCase().slice(0, 1));

	interface StageCell {
		state: 'awarded' | 'approved' | 'started' | 'none';
		date: string;
		/** The earlier section it was done in, e.g. "Cubs", when it wasn't this one */
		otherSection: string;
	}

	/** A stage's place in their record: awarded (with when and in which section), approved, started or not */
	function stageCell(summaries: OASSummary[], stream: string, stage: number): StageCell {
		const matches = summaries.filter((o) => o.stream === stream && o.stage === stage);
		const awarded = sortBy(
			matches.filter((o) => o.awarded),
			desc((o) => o.awarded ?? '')
		)[0];
		if (awarded)
			return {
				state: 'awarded',
				date: shortDate(awarded.awarded),
				otherSection:
					awarded.section && awarded.section !== thisSection
						? (SECTIONS[awarded.section] ?? awarded.section.toUpperCase())
						: ''
			};
		if (matches.some((o) => o.approved)) return { state: 'approved', date: '', otherSection: '' };
		if (matches.length > 0) return { state: 'started', date: '', otherSection: '' };
		return { state: 'none', date: '', otherSection: '' };
	}

	const awardedStages = (summaries: OASSummary[], stream: string) =>
		STAGES.map((stage) => ({ stage, cell: stageCell(summaries, stream, stage) })).filter(
			(s) => s.cell.state === 'awarded'
		);

	const STATE_NAMES = { awarded: 'Awarded', approved: 'Approved', started: 'Started', none: '' };
	const cellLabel = (stream: string, stage: number, cell: StageCell) =>
		[
			`${capitalised(stream)} Stage ${stage}`,
			cell.state === 'none' ? 'not started' : STATE_NAMES[cell.state],
			cell.date,
			cell.otherSection ? `in ${cell.otherSection}` : ''
		]
			.filter(Boolean)
			.join(', ');

	const siaSummaries = $derived(
		details
			? sortBy(
					details.siaSummaries,
					desc((s) => s.status),
					asc((s) => s.area)
				)
			: []
	);

	// The date each award item was done, where Terrain gives one
	const taskDates = $derived<Record<string, string>>(
		details
			? {
					'intro:scouting': shortDate(details.introToScouting),
					'intro:section': shortDate(details.introToSection),
					'peak:course': shortDate(details.peakAward.personalDevelopmentCourse),
					'peak:aj': shortDate(details.peakAward.adventurousJourney),
					'peak:reflection': shortDate(details.peakAward.personalReflection)
				}
			: {}
	);
	// Still to do first, then what's done
	const peakTasks = $derived(
		report
			? sortBy(
					report.peakAwardTasks,
					asc((t) => t.done)
				)
			: []
	);

	// Every section's award needs three milestones; once they're done there's nothing more to show
	const MILESTONES_REQUIRED = 3;
	const milestonesComplete = $derived(
		(details?.milestones.filter((m) => m.awarded).length ?? 0) >= MILESTONES_REQUIRED
	);

	const byArea = (logs: MilestoneLog[], area: string) =>
		logs.filter((l) => l.challengeArea === area);
	const activityCount = (m: MilestoneSummary) => m.participateLogs.length + m.leadLogs.length;
	// Every milestone being worked on shows what it still needs, not only the lowest: a youth can log
	// towards Milestone 2 before Milestone 1 is awarded
	const AREA_KEYS = ['community', 'outdoors', 'creative', 'personal_growth'];
	const inProgress = (m: MilestoneSummary) => !m.awarded && m.status !== 'Not Required';
	const needsOf = (m: MilestoneSummary) =>
		milestoneNeeds(
			m.milestone,
			AREA_KEYS.map((area) => byArea(m.participateLogs, area).length),
			m.leadLogs.length + m.assistLogs.length
		);
</script>

<svelte:head>
	<title>Beacon / {name || 'Progress'}</title>
</svelte:head>

<BackLink href={pagePath('progress/')} label="Progress" />

<div class="person-head">
	<div class="person-name">
		<h2>{name || 'Progress'}</h2>
		{#if details}
			<div class="person-facts muted">
				{facts.join(' · ')}
				{#if movesUp}<div class="moves-up">{movesUp}</div>{/if}
			</div>
		{/if}
	</div>
	{#if details}
		<div class="toolbar">
			<button
				type="button"
				class="btn icon-btn {showFilters ? 'btn-primary' : 'btn-outline-primary'}"
				onclick={() => (showFilters = !showFilters)}
				title="Options"
				aria-label="Options{filterCount > 0 ? `, ${filterCount} set` : ''}"
				aria-expanded={showFilters}
			>
				<Icon name="list" />
				{#if filterCount > 0}<span class="filter-count" aria-hidden="true">{filterCount}</span>{/if}
			</button>
		</div>
	{/if}
</div>

{#if showFilters}
	<div class="options card">
		<label
			><input
				type="checkbox"
				class="form-check-input"
				bind:checked={showAllStages}
				onchange={loadInsights}
			/> Include all stages</label
		>
		<label
			><input
				type="checkbox"
				class="form-check-input"
				bind:checked={showNonCoreOAS}
				onchange={loadInsights}
			/> Include non-core OAS</label
		>
		<a
			class="btn btn-sm btn-outline-primary print-link"
			href={pagePath(`progress/report/?ids=${memberId}`)}
			><Icon name="print" /> Progress report to print</a
		>
	</div>
{/if}

{#if loadError}
	<div class="alert alert-danger">{loadError}</div>
{:else if !details}
	<p class="muted">Loading progress from Terrain...</p>
{:else}
	<div class="summary">
		<div class="summary-tile">
			<div class="summary-label">{report?.rules.peakAwardName ?? 'Award'}</div>
			<div class="summary-value">{report ? `${Math.round(peakAwardPercent(report))}%` : '–'}</div>
		</div>
		<div class="summary-tile">
			<div class="summary-label">
				{report?.milestone ? `Milestone ${report.milestone.number}` : 'Milestones'}
			</div>
			<div class="summary-value">
				{#if milestonesComplete}
					Completed
				{:else if report?.milestone}
					{milestoneTotal(report.milestone) - milestoneRemaining(report.milestone)}<span
						class="summary-of">/{milestoneTotal(report.milestone)}</span
					>
				{:else}
					{details.milestones.filter((m) => m.awarded).length}<span class="summary-of"> done</span>
				{/if}
			</div>
		</div>
		<div class="summary-tile">
			<div class="summary-label">OAS progressions</div>
			<div class="summary-value">{details.stats.oasProgressions}</div>
		</div>
		<div class="summary-tile">
			<div class="summary-label">Nights camped</div>
			<div class="summary-value">{details.stats.nightsCamped}</div>
			<div class="summary-note">{details.stats.kmsHiked} km hiked</div>
		</div>
	</div>

	<div class="tabs" role="tablist">
		<button type="button" role="tab" aria-selected={tab === 'next'} onclick={() => (tab = 'next')}
			>Next steps</button
		>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'awards'}
			onclick={() => (tab = 'awards')}>Awards</button
		>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'records'}
			onclick={() => (tab = 'records')}>Records</button
		>
	</div>

	<!-- Every tab is on the page, so printing shows them all; the screen shows the chosen one -->
	<div class="tab-panel" class:shown={tab === 'next'}>
		{#if insightsLoading && !report}
			<p class="muted">Working out what {details.member.firstName} is missing...</p>
		{:else if insightsError}
			<p class="text-danger">{insightsError}</p>
		{:else if report}
			{#if report.highlights.length > 0}
				<section class="card">
					<ul class="highlights">
						{#each report.highlights as highlight, i (i)}
							<li>{highlight}</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if report.closeToComplete.length > 0}
				<h3>Close to completing</h3>
				<div class="activities card-grid">
					{#each report.closeToComplete as activity, i (i)}
						<div class="card activity-card">
							<div class="activity-title">
								<strong>{activity.title}</strong>
								<span class="badge {activity.coversAll ? 'badge-success' : 'badge-warning'}"
									>{activity.coversAll ? 'one activity' : 'needs more'}</span
								>
							</div>
							<div class="small muted">{activity.summary}</div>
							{#each activity.steps as step, s (s)}
								<div class="small strong step">{step.phase}</div>
								<ul class="small">
									{#each step.items as item, j (j)}
										<li>{item}</li>
									{/each}
								</ul>
							{/each}
							{#each activity.notes as note, n (n)}
								<div class="small muted"><Icon name="info" /> {note}</div>
							{/each}
						</div>
					{/each}
				</div>
			{/if}

			{#if report.stages.length > 0}
				<h3>Outstanding OAS requirements</h3>
				<section class="card list">
					{#each report.stages as stage (`${stage.stream}/${stage.stage}`)}
						<details class="stage-detail" open={stage.isClose}>
							<summary>
								<span class="stage-name">
									<strong>{stage.streamDisplay} {stage.stage}</strong>
									<span class="small muted"
										>{stage.started ? `${stage.done}/${stage.total} done` : 'not started'}</span
									>
								</span>
								<span class="mini-track"
									><span style:width="{Math.round(percentDone(stage) * 100)}%"></span></span
								>
							</summary>
							<ul class="small requirements">
								{#each stage.remaining as requirement, i (i)}
									<li>
										<span class="muted">{requirement.inputGroup}:</span>
										{requirement.inputLabel}
										<span class="badge badge-info">{requirement.theme}</span>
									</li>
								{/each}
							</ul>
							{#if !app.isYouth}
								<a
									class="btn btn-sm btn-outline-primary record-stage"
									href={pagePath(
										`progress/${memberId}/record-oas/?stream=${stage.stream}&stage=${stage.stage}`
									)}>Record statements</a
								>
							{/if}
						</details>
					{/each}
				</section>
			{/if}

			{#if report.themes.length > 0}
				<h3>Themes in what's missing</h3>
				<section class="card list">
					{#each report.themes as theme (theme.theme)}
						<div class="row">
							<div class="row-main">
								<div class="strong">
									{theme.theme}
									{#if theme.unitNightSuitable}<span class="badge badge-success">unit night</span
										>{/if}
								</div>
								<div class="small muted">{theme.description}</div>
								<div class="small muted">{theme.stages.join(', ')}</div>
							</div>
							<div class="row-value">
								<div class="strong">{theme.count}</div>
								<div class="small muted">to do</div>
							</div>
						</div>
					{/each}
				</section>
			{/if}

			{#if report.highlights.length === 0 && report.closeToComplete.length === 0 && report.stages.length === 0}
				<p class="muted">Nothing outstanding to suggest right now.</p>
			{/if}
		{/if}
	</div>
	<div class="tab-panel" class:shown={tab === 'awards'}>
		<h3>Milestones</h3>
		{#if milestonesComplete}
			<section class="card list">
				<div class="row task done">
					<span class="task-mark"><Icon name="check" /></span>
					<div class="row-main">Completed</div>
				</div>
			</section>
		{:else}
			<section class="card list">
				{#each details.milestones as milestone (milestone.milestone)}
					{@const current = inProgress(milestone) ? needsOf(milestone) : null}
					<div class="milestone">
						<div class="row">
							<div class="row-main strong">Milestone {milestone.milestone}</div>
							<div class="row-value muted">
								{milestone.awarded ? `Awarded ${shortDate(milestone.awarded)}` : milestone.status}
							</div>
						</div>
						{#if current}
							<div class="needs">
								{#each [...current.participates, current.leadAssist] as need (need.challengeArea)}
									<div class="need-row">
										<div class="need-label">{need.challengeArea}</div>
										<div class="need-track">
											<div
												class="need-fill"
												class:need-done={needRemaining(need) === 0}
												style:width="{needWidth(need)}%"
											></div>
										</div>
										<div class="need-value">{Math.min(need.have, need.need)}/{need.need}</div>
									</div>
								{/each}
							</div>
						{/if}
						{#if activityCount(milestone) > 0}
							<details class="activities-fold">
								<summary class="small">Activities ({activityCount(milestone)})</summary>
								{#each AREAS as area (area.key)}
									{#if byArea(milestone.participateLogs, area.key).length > 0}
										<div class="small strong area-name">{area.name}</div>
										<ul class="small events">
											{#each byArea(milestone.participateLogs, area.key) as event, i (i)}
												<li>
													{event.eventName} <span class="muted">{shortDate(event.eventDate)}</span>
												</li>
											{/each}
										</ul>
									{/if}
								{/each}
								{#if milestone.leadLogs.length > 0}
									<div class="small strong area-name">Led</div>
									<ul class="small events">
										{#each milestone.leadLogs as event, i (i)}
											<li>
												{event.eventName}
												<span class="muted"
													>{shortDate(event.eventDate)} · {AREA_NAMES[event.challengeArea] ??
														event.challengeArea}</span
												>
											</li>
										{/each}
									</ul>
								{/if}
							</details>
						{/if}
					</div>
				{/each}
			</section>
		{/if}

		{#if report}
			<h3>
				{report.rules.peakAwardName}
				<span class="muted percent">{Math.round(peakAwardPercent(report))}%</span>
			</h3>
			<section class="card">
				<div class="bar"><div style:width="{Math.round(peakAwardPercent(report))}%"></div></div>
				<div class="small muted breakdown">
					{report.peakAwardBreakdown
						.map((c) => `${c.name} ${formatOneDecimal(c.earned)}/${formatOneDecimal(c.max)}`)
						.join(' · ')}
				</div>
				{#if details.peakAward.awarded}
					<div class="small strong">Awarded {shortDate(details.peakAward.awarded)}</div>
				{/if}
			</section>
			<section class="card list checklist">
				{#each peakTasks as task (task.key)}
					<div class="row task" class:done={task.done}>
						<span class="task-mark"><Icon name={task.done ? 'check' : 'x'} /></span>
						<div class="row-main">
							<div>{task.title}</div>
							{#if task.detail && !task.done}<div class="small muted">{task.detail}</div>{/if}
						</div>
						{#if taskDates[task.key]}<div class="row-value muted">{taskDates[task.key]}</div>{/if}
					</div>
				{/each}
			</section>
		{:else if insightsLoading}
			<p class="muted">Working out {details.member.firstName}'s award...</p>
		{:else}
			<h3>Introductions and Peak Award</h3>
			<section class="card list">
				{#each [['Introduction to Scouting', details.introToScouting], ['Introduction to Section', details.introToSection], ['Personal Development Course', details.peakAward.personalDevelopmentCourse], ['Adventurous Journey', details.peakAward.adventurousJourney], ['Personal Reflection', details.peakAward.personalReflection]] as const as [label, date] (label)}
					<div class="row">
						<div class="row-main">{label}</div>
						<div class="row-value muted">{date ? shortDate(date) : 'Not yet'}</div>
					</div>
				{/each}
			</section>
		{/if}
	</div>
	<div class="tab-panel" class:shown={tab === 'records'}>
		<div class="section-head">
			<h3>Outdoor Adventure Skills</h3>
			{#if !app.isYouth}
				<a
					class="btn btn-sm btn-outline-primary"
					href={pagePath(`progress/${memberId}/record-oas/`)}>Record OAS</a
				>
			{/if}
		</div>
		<section class="card oas-card">
			<div class="oas-grid" style:--stages={STAGES.length}>
				<div></div>
				{#each STAGES as stage (stage)}<div class="oas-stage-head small muted">{stage}</div>{/each}
				{#each oasStreams as stream (stream)}
					<div class="oas-stream">{capitalised(stream)}</div>
					{#each STAGES as stage (stage)}
						{@const cell = stageCell(details.oasSummaries, stream, stage)}
						<div
							class="oas-cell {cell.state}"
							class:other-section={cell.otherSection}
							title={cellLabel(stream, stage, cell)}
							aria-label={cellLabel(stream, stage, cell)}
							role="img"
						>
							{#if cell.state === 'awarded'}<Icon name="check" />{/if}
						</div>
					{/each}
				{/each}
			</div>
			<div class="legend small muted">
				<span><span class="oas-cell awarded"><Icon name="check" /></span> Awarded</span>
				<span><span class="oas-cell approved"></span> Approved</span>
				<span><span class="oas-cell started"></span> Started</span>
				<span
					><span class="oas-cell awarded other-section"><Icon name="check" /></span> Earlier section</span
				>
			</div>
			{#if !showNonCoreOAS}
				<div class="small muted">Core streams only; the other streams show under Options.</div>
			{/if}
			<details class="dates-fold">
				<summary class="small">Dates awarded</summary>
				<ul class="small">
					{#each oasStreams as stream (stream)}
						{@const awarded = awardedStages(details.oasSummaries, stream)}
						{#if awarded.length > 0}
							<li>
								<strong>{capitalised(stream)}</strong>
								{awarded
									.map(
										(s) =>
											`Stage ${s.stage} ${s.cell.date}${s.cell.otherSection ? ` (${s.cell.otherSection})` : ''}`
									)
									.join(' · ')}
							</li>
						{/if}
					{/each}
				</ul>
			</details>
		</section>

		<h3>Special Interest Areas</h3>
		<section class="card list">
			{#each siaSummaries as sia, i (i)}
				<div class="row sia">
					<div class="row-main">
						<div class="strong">{sia.area}</div>
						<div class="small muted">{sia.project}</div>
					</div>
					<div class="row-value">
						<div>{sia.status}</div>
						<div class="small muted">{shortDate(sia.updated)}</div>
					</div>
				</div>
			{:else}
				<div class="row muted">None yet</div>
			{/each}
		</section>

		<h3>Logbook</h3>
		<section class="card list stats">
			<div class="row">
				<div class="row-main">Nights camped</div>
				<div class="row-value">{details.stats.nightsCamped}</div>
			</div>
			<div class="row">
				<div class="row-main">Nights camped in the section</div>
				<div class="row-value">{details.stats.nightsCampedInSection}</div>
			</div>
			<div class="row">
				<div class="row-main">Kilometres hiked</div>
				<div class="row-value">{details.stats.kmsHiked}</div>
			</div>
			<div class="row">
				<div class="row-main">OAS stage progressions</div>
				<div class="row-value">{details.stats.oasProgressions}</div>
			</div>
		</section>
	</div>
{/if}

<style>
	.tab-panel:not(.shown) {
		display: none;
	}

	@media print {
		.tab-panel:not(.shown) {
			display: block;
		}

		.tabs,
		.back-link,
		.toolbar {
			display: none;
		}
	}

	.person-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.person-head h2 {
		margin-bottom: 0.15rem;
	}

	.person-facts {
		font-size: 0.95rem;
	}

	.moves-up {
		color: var(--text-2);
	}

	.toolbar {
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		position: relative;
		width: 44px;
		height: 44px;
	}

	.filter-count {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 1.15rem;
		height: 1.15rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: var(--warning);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1.15rem;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		margin-bottom: 1rem;
	}

	.options {
		align-items: center;
	}

	.print-link {
		margin-left: auto;
	}

	.options label {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 44px;
	}

	/* The four numbers at the top */
	.summary {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.summary-tile {
		min-width: 0;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.summary-label {
		overflow: hidden;
		color: var(--muted);
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.summary-value {
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.summary-of {
		color: var(--muted);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.summary-note {
		color: var(--muted);
		font-size: 0.75rem;
	}

	@media (max-width: 575.98px) {
		.summary {
			grid-template-columns: 1fr 1fr;
		}
	}

	h3 {
		margin: 1.25rem 0 0.5rem;
		font-size: 1.125rem;
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 1.25rem 0 0.5rem;
	}

	.section-head h3 {
		margin: 0;
	}

	.card {
		margin-bottom: 0.75rem;
	}

	/* Rows as in the phone's own settings: a name on the left, a value on the right, hairlines between */
	.list {
		padding-top: 0;
		padding-bottom: 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 44px;
		padding: 0.55rem 0;
	}

	.list > .row + .row,
	.list > * + * {
		border-top: 0.5px solid var(--border);
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.row-value {
		flex-shrink: 0;
		text-align: right;
	}

	.highlights {
		margin: 0;
		padding-left: 1.2rem;
	}

	.highlights li + li {
		margin-top: 0.3rem;
	}

	.activities {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
	}

	.activity-card ul {
		margin: 0 0 0.5rem;
	}

	.step {
		margin-top: 0.4rem;
	}

	.activity-title {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.2rem;
	}

	.stage-detail summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 52px;
		cursor: pointer;
	}

	.stage-name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.5rem;
	}

	.requirements {
		margin: 0 0 0.5rem;
		padding-left: 1.2rem;
	}

	.requirements li + li {
		margin-top: 0.25rem;
	}

	.record-stage {
		margin-bottom: 0.75rem;
	}

	.mini-track {
		display: inline-block;
		flex-shrink: 0;
		width: 5rem;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.mini-track span {
		display: block;
		height: 100%;
		background: var(--success);
	}

	.milestone {
		padding-bottom: 0.4rem;
	}

	.needs {
		margin: 0.1rem 0 0.4rem;
	}

	.need-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.need-label {
		flex: 0 0 7rem;
		font-size: 0.875rem;
	}

	.need-track {
		flex: 1 1 auto;
		height: 10px;
		border-radius: 5px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.need-fill {
		height: 100%;
		border-radius: 5px;
		background: #7b61b5;
	}

	.need-fill.need-done {
		background: var(--success);
	}

	.need-value {
		flex: 0 0 2.5rem;
		font-size: 0.85rem;
		text-align: right;
	}

	.activities-fold summary,
	.dates-fold summary {
		min-height: 36px;
		color: var(--tint);
		cursor: pointer;
		line-height: 36px;
	}

	.area-name {
		margin-top: 0.3rem;
	}

	.events {
		margin: 0.1rem 0 0.3rem;
		padding-left: 1.2rem;
	}

	.percent {
		font-weight: 500;
	}

	.bar {
		height: 10px;
		border-radius: 5px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.bar div {
		height: 100%;
		background: var(--success);
	}

	.breakdown {
		margin-top: 0.4rem;
	}

	.task-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: var(--alert-danger-bg);
		color: var(--danger);
		font-size: 0.75rem;
	}

	.task.done .task-mark {
		background: var(--alert-success-bg);
		color: var(--success);
	}

	/* OAS stages: a row per stream, a dot per stage */
	.oas-grid {
		display: grid;
		grid-template-columns: minmax(5.5rem, auto) repeat(var(--stages), minmax(0, 1fr));
		align-items: center;
		gap: 0.4rem 0.25rem;
	}

	.oas-stage-head {
		text-align: center;
	}

	.oas-stream {
		overflow: hidden;
		font-size: 0.9rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.oas-cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		justify-self: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--fill);
		color: #fff;
		font-size: 0.7rem;
	}

	.oas-cell.awarded {
		background: var(--success);
	}

	.oas-cell.awarded.other-section {
		background: var(--alert-success-bg);
		color: var(--success);
	}

	.oas-cell.approved {
		background: transparent;
		box-shadow: inset 0 0 0 2px var(--success);
	}

	.oas-cell.started {
		background: transparent;
		box-shadow: inset 0 0 0 2px var(--warning);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		margin: 0.75rem 0 0.25rem;
	}

	.legend > span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend .oas-cell {
		width: 1.1rem;
		height: 1.1rem;
		font-size: 0.55rem;
	}

	.dates-fold ul {
		margin: 0 0 0.5rem;
		padding-left: 1.2rem;
	}

	.sia .row-value {
		min-width: 6rem;
	}
</style>
