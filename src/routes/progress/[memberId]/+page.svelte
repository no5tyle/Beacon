<!--
	One youth's progress: insights into what they're missing, then their introductions, milestones,
	OAS stages, logbook statistics, special interest areas and peak award.
-->
<script lang="ts">
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import { shortDate } from '#lib/model/dates.js';
	import {
		needRemaining,
		peakAwardPercent,
		percentDone,
		type ChallengeAreaNeed,
		type MemberInsightsReport
	} from '#lib/model/insights/memberModels.js';
	import { readInsightsSettings } from '#lib/stores/storage.js';
	import { asc, desc, formatOneDecimal, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, insights, members, progress } from '#lib/services/index.js';
	import type { MilestoneLog, OASSummary, ProgressDetails } from '#lib/services/progress.js';

	const memberId = $derived(page.params.memberId ?? '');

	let details = $state<ProgressDetails | null>(null);
	let loadError = $state('');
	let report = $state<MemberInsightsReport | null>(null);
	let insightsLoading = $state(false);
	let insightsError = $state('');
	// Non-core OAS streams are hidden unless the leader asks for them
	// Insights' filters from earlier in this tab: the moving up window and section rules, and where these start
	const saved = readInsightsSettings();
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

	const name = $derived(
		details ? `${details.member.firstName} ${members.lastName(details.member)}` : ''
	);

	const needWidth = (need: ChallengeAreaNeed) =>
		need.need === 0 ? 100 : Math.round(Math.min(100, (100 * need.have) / need.need));

	const AREAS = [
		{ key: 'community', name: 'Community' },
		{ key: 'outdoors', name: 'Outdoors' },
		{ key: 'creative', name: 'Creative' },
		{ key: 'personal_growth', name: 'Personal Growth' }
	];
	const AREA_ABBREVIATIONS: Record<string, string> = {
		community: '(Co)',
		creative: '(Cr)',
		outdoors: '(O)',
		personal_growth: '(PG)'
	};

	const CORE_STREAMS = ['bushcraft', 'bushwalking', 'camping'];
	const NON_CORE_STREAMS = ['alpine', 'cycling', 'vertical', 'aquatics', 'boating', 'paddling'];
	const STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
	const oasStreams = $derived(
		showNonCoreOAS ? [...CORE_STREAMS, ...NON_CORE_STREAMS] : CORE_STREAMS
	);
	const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

	/** A stage's cell: the date awarded with the section it was done in, Approved, Started or blank */
	function formatOAS(summaries: OASSummary[], stream: string, stage: number): string {
		const matches = summaries.filter((o) => o.stream === stream && o.stage === stage);
		if (matches.length === 0) return '';
		const awarded = sortBy(
			matches.filter((o) => o.awarded),
			desc((o) => o.awarded ?? '')
		)[0];
		if (awarded) return `${shortDate(awarded.awarded)} ${awarded.section}`;
		if (matches.some((o) => o.approved)) return 'Approved';
		return 'Started';
	}

	const siaSummaries = $derived(
		details
			? sortBy(
					details.siaSummaries,
					desc((s) => s.status),
					asc((s) => s.area)
				)
			: []
	);
	const peakTasks = $derived(
		report
			? sortBy(
					report.peakAwardTasks,
					asc((t) => t.done)
				)
			: []
	);
	const byArea = (logs: MilestoneLog[], area: string) =>
		logs.filter((l) => l.challengeArea === area);
</script>

<svelte:head>
	<title>Beacon / Progress Details</title>
</svelte:head>

<h2>Progress Details{name ? ` for ${name}` : ''}</h2>

{#if loadError}
	<div class="alert alert-danger">{loadError}</div>
{:else if !details}
	<p class="muted">Loading progress from Terrain...</p>
{:else}
	<div class="stack">
		<section class="card insights-card">
			<div class="card-head">
				<span><Icon name="graph" /> Insights</span>
				<span class="options small">
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
				</span>
			</div>

			{#if insightsLoading && !report}
				<p class="muted">Working out what {details.member.firstName} is missing...</p>
			{:else if insightsError}
				<p class="text-danger">{insightsError}</p>
			{:else if report}
				{#if report.highlights.length > 0}
					<ul class="highlights">
						{#each report.highlights as highlight, i (i)}
							<li>{highlight}</li>
						{/each}
					</ul>
				{/if}

				{#if report.closeToComplete.length > 0}
					<h4>Close to completing</h4>
					<div class="activities">
						{#each report.closeToComplete as activity, i (i)}
							<div class="activity-card">
								<div class="activity-title">
									<strong>{activity.title}</strong>
									<span class="badge {activity.coversAll ? 'badge-success' : 'badge-warning'}"
										>{activity.coversAll ? 'one activity' : 'needs more'}</span
									>
								</div>
								<div class="small muted">{activity.summary}</div>
								{#each activity.steps as step, s (s)}
									<div class="small strong">{step.phase}</div>
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

				<div class="two-up">
					{#if report.milestone}
						<div>
							<h4>Milestone {report.milestone.number}</h4>
							{#each [...report.milestone.participates, report.milestone.leadAssist] as need (need.challengeArea)}
								<div class="need-row">
									<div class="need-label">{need.challengeArea}</div>
									<div class="need-track">
										<div
											class="need-fill"
											class:need-done={needRemaining(need) === 0}
											style:width="{needWidth(need)}%"
										></div>
									</div>
									<div class="need-value">{Math.min(need.have, need.need)} / {need.need}</div>
								</div>
							{/each}
						</div>
					{/if}
					<div>
						<h4>
							{report.rules.peakAwardName}
							<span class="muted percent">{Math.round(peakAwardPercent(report))}%</span>
						</h4>
						<div class="bar"><div style:width="{Math.round(peakAwardPercent(report))}%"></div></div>
						<div class="small muted breakdown">
							{report.peakAwardBreakdown
								.map((c) => `${c.name} ${formatOneDecimal(c.earned)}/${formatOneDecimal(c.max)}`)
								.join(' · ')}
						</div>
						<div class="tasks">
							{#each peakTasks as task (task.key)}
								<span class="task-chip" class:done={task.done} title={task.detail}
									><Icon name={task.done ? 'check' : 'x'} /> {task.title}</span
								>
							{/each}
						</div>
					</div>
				</div>

				{#if report.themes.length > 0}
					<h4>Themes in what's missing</h4>
					<div class="table-scroll">
						<table class="table">
							<thead>
								<tr><th>Theme</th><th class="num">Requirements</th><th>Stages</th><th></th></tr>
							</thead>
							<tbody>
								{#each report.themes as theme (theme.theme)}
									<tr>
										<td
											><strong>{theme.theme}</strong><br /><small class="muted"
												>{theme.description}</small
											></td
										>
										<td class="num">{theme.count}</td>
										<td>{theme.stages.join(', ')}</td>
										<td>
											{#if theme.unitNightSuitable}<span class="badge badge-success"
													>unit night</span
												>{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if report.stages.length > 0}
					<h4>Outstanding OAS requirements</h4>
					{#each report.stages as stage (`${stage.stream}/${stage.stage}`)}
						<details class="stage-detail" open={stage.isClose}>
							<summary>
								<strong>{stage.streamDisplay} {stage.stage}</strong>
								<span class="muted"
									>{stage.started ? `${stage.done}/${stage.total} done` : 'not started'}</span
								>
								{#if !app.isYouth}
									<a
										class="small"
										href={pagePath(
											`progress/${memberId}/record-oas/?stream=${stage.stream}&stage=${stage.stage}`
										)}>Record statements</a
									>
								{/if}
								<span class="mini-track"
									><span style:width="{Math.round(percentDone(stage) * 100)}%"></span></span
								>
							</summary>
							<ul class="small">
								{#each stage.remaining as requirement, i (i)}
									<li>
										<span class="muted">{requirement.inputGroup}:</span>
										{requirement.inputLabel}
										<span class="badge badge-info">{requirement.theme}</span>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				{/if}
			{/if}
		</section>

		<section class="card">
			<div class="card-head">Member</div>
			<dl class="facts">
				<dt>Number:</dt>
				<dd>{details.member.memberNumber}</dd>
			</dl>
		</section>

		<section class="card">
			<div class="card-head">Introductions</div>
			<dl class="facts">
				<dt>Intro to Scouting:</dt>
				<dd>{shortDate(details.introToScouting)}</dd>
				<dt>Intro to Section:</dt>
				<dd>{shortDate(details.introToSection)}</dd>
			</dl>
		</section>

		<section class="card">
			<div class="card-head">Milestones</div>
			{#each details.milestones as milestone (milestone.milestone)}
				<div class="milestone">
					<div class="milestone-head">
						Milestone {milestone.milestone}: {milestone.status}
						{shortDate(milestone.awarded)}
					</div>
					<div class="milestone-body">
						{#each AREAS as area (area.key)}
							<div class="milestone-area">{area.name}:</div>
							<div class="events">
								{#each byArea(milestone.participateLogs, area.key) as event, i (i)}
									<div>{event.eventName}<br />{shortDate(event.eventDate)}</div>
								{/each}
							</div>
						{/each}
						<div class="milestone-area">Lead:</div>
						<div class="events">
							{#each milestone.leadLogs as event, i (i)}
								<div>
									{event.eventName}<br />{shortDate(event.eventDate)}
									{AREA_ABBREVIATIONS[event.challengeArea] ?? ''}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</section>

		<section class="card">
			<div class="card-head">
				<span>
					Outdoor Adventure Skills
					{#if !showNonCoreOAS}
						<small class="muted note"
							>(core streams; tick "Include non-core OAS" above to see all)</small
						>
					{/if}
				</span>
				{#if !app.isYouth}
					<a
						class="btn btn-sm btn-outline-primary"
						href={pagePath(`progress/${memberId}/record-oas/`)}>Record OAS</a
					>
				{/if}
			</div>
			<div class="table-scroll">
				<table class="table stack-table">
					<thead>
						<tr>
							<th></th>
							{#each STAGES as stage (stage)}<th>Stage {stage}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each oasStreams as stream (stream)}
							<tr>
								<td class="stack-title">{capitalised(stream)}:</td>
								{#each STAGES as stage (stage)}
									<td data-label="Stage {stage}"
										>{formatOAS(details.oasSummaries, stream, stage)}</td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card">
			<div class="card-head">Statistics</div>
			<dl class="facts stats">
				<dt>Progressions:</dt>
				<dd>{details.stats.oasProgressions}</dd>
				<dt>KMs Hiked:</dt>
				<dd>{details.stats.kmsHiked}</dd>
				<dt>Nights Camped:</dt>
				<dd>{details.stats.nightsCamped}</dd>
				<dt>Camped in Section:</dt>
				<dd>{details.stats.nightsCampedInSection}</dd>
			</dl>
		</section>

		<section class="card">
			<div class="card-head">Special Interest Areas</div>
			<table class="table stack-table">
				<thead>
					<tr><th>Area</th><th>Project</th><th>Status</th><th>Date</th></tr>
				</thead>
				<tbody>
					{#each siaSummaries as sia, i (i)}
						<tr>
							<td class="stack-title">{sia.area}</td>
							<td data-label="Project">{sia.project}</td>
							<td data-label="Status">{sia.status}</td>
							<td data-label="Date">{shortDate(sia.updated)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="card">
			<div class="card-head">Peak Award {shortDate(details.peakAward.awarded)}</div>
			<dl class="facts peak">
				<dt>Personal Development Course:</dt>
				<dd>{shortDate(details.peakAward.personalDevelopmentCourse)}</dd>
				<dt>Adventurous Journey:</dt>
				<dd>{shortDate(details.peakAward.adventurousJourney)}</dd>
				<dt>Personal Reflection:</dt>
				<dd>{shortDate(details.peakAward.personalReflection)}</dd>
			</dl>
		</section>

		<div>
			<a class="btn btn-primary" href={pagePath('progress/')}>Back</a>
		</div>
	</div>
{/if}

<style>
	.insights-card {
		border-top: 4px solid #4fb3bd;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}

	.options label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	h4 {
		margin: 1rem 0 0.5rem;
	}

	.highlights {
		margin: 0 0 0.75rem;
		padding-left: 1.2rem;
	}

	.highlights li {
		margin-bottom: 0.2rem;
	}

	.activities {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: 0.75rem;
	}

	.activity-card {
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-left: 4px solid #4fb3bd;
		border-radius: 0.4rem;
	}

	.activity-card ul {
		margin: 0 0 0.5rem;
	}

	.activity-title {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.two-up {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
		gap: 0 1.5rem;
	}

	.need-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.need-label {
		flex: 0 0 105px;
		font-size: 0.9rem;
	}

	.need-track {
		flex: 1 1 auto;
		height: 14px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.need-fill {
		height: 100%;
		background: #7b61b5;
	}

	.need-fill.need-done {
		background: var(--success);
	}

	.need-value {
		flex: 0 0 50px;
		font-size: 0.85rem;
		text-align: right;
	}

	.percent {
		font-weight: 400;
	}

	.breakdown {
		margin: 0.25rem 0 0.5rem;
	}

	.tasks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.task-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.6rem;
		border-radius: 999px;
		background: #fbeaea;
		color: #b02a37;
		font-size: 0.85rem;
	}

	.task-chip.done {
		background: #e8f5ee;
		color: #146c43;
	}

	.stage-detail {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border-soft);
	}

	.stage-detail summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.6rem;
		min-height: 44px;
		cursor: pointer;
	}

	.stage-detail ul {
		margin: 0.5rem 0;
	}

	.mini-track {
		display: inline-block;
		width: 120px;
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

	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.35rem 1rem;
		margin: 0;
	}

	.facts dd {
		margin: 0;
	}

	@media (min-width: 576px) {
		.stats {
			grid-template-columns: repeat(4, max-content 4rem);
		}
	}

	.milestone + .milestone {
		margin-top: 0.75rem;
	}

	.milestone {
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.milestone-head {
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}

	.milestone-body {
		display: grid;
		grid-template-columns: 9rem 1fr;
		gap: 0.4rem 0.75rem;
		padding: 0.6rem 0.75rem;
	}

	.events {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.4rem 0.75rem;
	}

	.note {
		font-weight: 400;
	}

	@media (max-width: 575.98px) {
		.milestone-body {
			grid-template-columns: 1fr;
		}

		.milestone-area {
			margin-top: 0.4rem;
			font-weight: 600;
		}

		.events {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media screen and (prefers-color-scheme: dark) {
		.task-chip {
			background: #3a1a1d;
			color: #f2a7ad;
		}

		.task-chip.done {
			background: #16301f;
			color: #9fdcb5;
		}
	}
</style>
