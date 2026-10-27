<!--
	Progress reports to print and hand to parents: one page per youth, with the parts the leader ticks.
	Reached from Progress (every youth) or a youth's details (just them), with ?ids= naming who's ticked.
-->
<script lang="ts">
	import { page } from '$app/state';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { shortDate, today, toCalendarDate } from '#lib/model/dates.js';
	import {
		milestoneRemaining,
		milestoneTotal,
		peakAwardPercent,
		type MemberInsightsReport
	} from '#lib/model/insights/memberModels.js';
	import type { ReportOptions } from '#lib/model/report.js';
	import { asc, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, insights, members, progress, reports } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import type { ProgressDetails } from '#lib/services/progress.js';
	import type { ReportStage } from '#lib/services/reports.js';
	import {
		readInsightsSettings,
		readReportOptions,
		writeReportOptions
	} from '#lib/stores/storage.js';

	interface Prepared {
		details: ProgressDetails;
		report: MemberInsightsReport | null;
		stages: ReportStage[];
	}

	const PARTS: { key: keyof ReportOptions; label: string; under?: keyof ReportOptions }[] = [
		{ key: 'summary', label: 'Summary' },
		{ key: 'nextSteps', label: 'Next steps' },
		{ key: 'milestones', label: 'Milestones' },
		{ key: 'award', label: 'Award checklist' },
		{ key: 'oas', label: 'Outdoor Adventure Skills' },
		{ key: 'achievedStatements', label: 'Achieved "I can" statements', under: 'oas' },
		{ key: 'notYetStatements', label: 'Statements still to do', under: 'oas' },
		{ key: 'nonCoreOAS', label: 'Non-core streams', under: 'oas' },
		{ key: 'sia', label: 'Special interest areas' },
		{ key: 'logbook', label: 'Logbook' },
		{ key: 'note', label: "Leader's note" },
		{ key: 'signatures', label: 'Signature lines' }
	];

	let options = $state(readReportOptions());
	$effect(() => writeReportOptions($state.snapshot(options)));

	let youth = $state<MemberSummary[]>([]);
	let chosen = $state<string[]>([]);
	let loadError = $state('');
	// Each youth's report data, kept while the page is open so changing an option doesn't load it again
	let prepared = $state<Record<string, Prepared | 'failed'>>({});
	// Notes typed on the reports. Not kept anywhere: they're about the youth
	let notes = $state<Record<string, string>>({});
	const settings = readInsightsSettings();
	const printedOn = shortDate(today());

	// The unit's youth, with those named in the address (or everyone) ticked
	$effect(() => {
		const unitId = app.unitId;
		youth = [];
		prepared = {};
		if (!unitId) return;
		const asked = (page.url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
		members
			.youth(unitId)
			.then((found) => {
				if (unitId !== app.unitId) return;
				youth = sortBy(
					found,
					asc((m) => m.firstName),
					asc((m) => m.lastName)
				);
				chosen =
					asked.length > 0
						? asked.filter((id) => youth.some((y) => y.id === id))
						: youth.map((y) => y.id);
			})
			.catch(() => (loadError = "Couldn't load the unit's youth from Terrain."));
	});

	// Loads what the ticked youth's reports need, one youth at a time. OAS stages are loaded again if the
	// non-core streams are switched on, as are the award figures that count them
	let loadKey = '';
	$effect(() => {
		const key = `${app.unitId}|${options.nonCoreOAS}`;
		if (key !== loadKey) {
			loadKey = key;
			prepared = {};
		}
		const waiting = chosen.filter((id) => !prepared[id]);
		if (waiting.length > 0) prepare(waiting[0]);
	});

	let preparing = '';
	async function prepare(memberId: string) {
		if (preparing) return;
		preparing = memberId;
		const unitId = app.unitId;
		const nonCore = options.nonCoreOAS;
		try {
			const details = await progress.details(unitId, memberId);
			const [report, stages] = await Promise.all([
				insights
					.memberReport(unitId, details, { ...settings, includeNonCoreOAS: nonCore })
					.catch(() => null),
				reports.oasStages(memberId, nonCore).catch(() => [])
			]);
			if (unitId === app.unitId && nonCore === options.nonCoreOAS)
				prepared[memberId] = { details, report, stages };
		} catch {
			prepared[memberId] = 'failed';
		}
		preparing = '';
		// Moves on to the next youth
		chosen = [...chosen];
	}

	const ready = $derived(chosen.filter((id) => prepared[id] && prepared[id] !== 'failed').length);
	const toggleYouth = (id: string, on: boolean) =>
		(chosen = on
			? youth.filter((y) => y.id === id || chosen.includes(y.id)).map((y) => y.id)
			: chosen.filter((c) => c !== id));

	const nameOf = (m: MemberSummary) => `${m.firstName} ${members.lastName(m)}`;
	const AREAS: Record<string, string> = {
		community: 'Community',
		outdoors: 'Outdoors',
		creative: 'Creative',
		personal_growth: 'Personal Growth'
	};
	const dateText = (value: string) => (value ? shortDate(toCalendarDate(value)) : '');
	const STATUS_TEXT = { awarded: 'Awarded', approved: 'Approved', started: 'In progress' };
	const shownStatements = (stage: ReportStage) =>
		stage.statements.filter((s) =>
			s.achieved ? options.achievedStatements : options.notYetStatements
		);
	const milestonesComplete = (details: ProgressDetails) =>
		details.milestones.filter((m) => m.awarded).length >= 3;
</script>

<svelte:head>
	<title>Beacon / Progress reports</title>
</svelte:head>

<div class="no-print">
	<a class="back-link" href={pagePath('progress/')}><Icon name="chevron-left" /> Progress</a>
	<div class="head">
		<h2>Progress reports</h2>
		<button
			type="button"
			class="btn btn-primary"
			disabled={ready === 0}
			onclick={() => window.print()}><Icon name="print" /> Print</button
		>
	</div>
	<p class="muted">
		A page for each youth to print and hand to their parents. Tick what to include; Beacon remembers
		your choice on this device. Notes typed on a report aren't kept.
	</p>

	{#if !app.unitId}
		<ChooseUnit />
	{/if}
	{#if loadError}
		<div class="alert alert-danger">{loadError}</div>
	{/if}

	<div class="choices">
		<section class="card">
			<h3>Include</h3>
			{#each PARTS as part (part.key)}
				<label class="check" class:indent={part.under}>
					<input
						type="checkbox"
						class="form-check-input"
						bind:checked={options[part.key]}
						disabled={part.under ? !options[part.under] : false}
					/>
					{part.label}
				</label>
			{/each}
		</section>

		{#if youth.length > 0}
			<section class="card">
				<div class="choose-head">
					<h3>Youth</h3>
					<button
						type="button"
						class="btn btn-link btn-sm"
						onclick={() => (chosen = chosen.length === youth.length ? [] : youth.map((y) => y.id))}
						>{chosen.length === youth.length ? 'None' : 'All'}</button
					>
				</div>
				{#each youth as member (member.id)}
					<label class="check">
						<input
							type="checkbox"
							class="form-check-input"
							checked={chosen.includes(member.id)}
							onchange={(e) => toggleYouth(member.id, e.currentTarget.checked)}
						/>
						{nameOf(member)}
					</label>
				{/each}
			</section>
		{/if}
	</div>

	{#if chosen.length > 0 && ready < chosen.length}
		<p class="muted">Preparing reports from Terrain... {ready} of {chosen.length}</p>
	{/if}
</div>

{#each youth.filter((y) => chosen.includes(y.id)) as member (member.id)}
	{@const data = prepared[member.id]}
	{#if data === 'failed'}
		<div class="alert alert-danger no-print">
			Couldn't load {nameOf(member)}'s progress from Terrain.
		</div>
	{:else if data}
		{@const { details, report, stages } = data}
		<article class="report">
			<header class="report-head">
				<div>
					<div class="report-kicker">{app.unitName} · Progress report</div>
					<h2 class="report-name">{nameOf(member)}</h2>
					<div class="muted">
						{[member.patrolName && `${member.patrolName} Patrol`, member.patrolDuty]
							.filter(Boolean)
							.join(' · ')}
					</div>
				</div>
				<div class="report-date muted">{printedOn}</div>
			</header>

			{#if options.summary}
				<div class="summary">
					{#if report}
						<div class="tile">
							<div class="tile-label">{report.rules.peakAwardName}</div>
							<div class="tile-value">{Math.round(peakAwardPercent(report))}%</div>
						</div>
					{/if}
					<div class="tile">
						<div class="tile-label">
							{report?.milestone && !milestonesComplete(details)
								? `Milestone ${report.milestone.number}`
								: 'Milestones'}
						</div>
						<div class="tile-value">
							{#if milestonesComplete(details)}
								Completed
							{:else if report?.milestone}
								{milestoneTotal(report.milestone) - milestoneRemaining(report.milestone)} of {milestoneTotal(
									report.milestone
								)}
							{:else}
								{details.milestones.filter((m) => m.awarded).length} done
							{/if}
						</div>
					</div>
					<div class="tile">
						<div class="tile-label">OAS stages</div>
						<div class="tile-value">{details.stats.oasProgressions}</div>
					</div>
					<div class="tile">
						<div class="tile-label">Nights camped</div>
						<div class="tile-value">{details.stats.nightsCamped}</div>
					</div>
					<div class="tile">
						<div class="tile-label">Km hiked</div>
						<div class="tile-value">{details.stats.kmsHiked}</div>
					</div>
				</div>
			{/if}

			{#if options.nextSteps && report && report.highlights.length > 0}
				<section class="part">
					<h3>Next steps</h3>
					<ul>
						{#each report.highlights as highlight, i (i)}<li>{highlight}</li>{/each}
					</ul>
				</section>
			{/if}

			{#if options.milestones}
				<section class="part">
					<h3>Milestones</h3>
					{#if milestonesComplete(details)}
						<p>All three milestones completed.</p>
					{:else}
						<ul class="plain">
							{#each details.milestones as milestone (milestone.milestone)}
								<li>
									<strong>Milestone {milestone.milestone}</strong>
									{milestone.awarded
										? `awarded ${shortDate(milestone.awarded)}`
										: milestone.status.toLowerCase()}
								</li>
							{/each}
						</ul>
						{#if report?.milestone}
							<table class="needs">
								<tbody>
									{#each [...report.milestone.participates, report.milestone.leadAssist] as need (need.challengeArea)}
										<tr>
											<td>{AREAS[need.challengeArea] ?? need.challengeArea}</td>
											<td class="num">{Math.min(need.have, need.need)} of {need.need}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					{/if}
				</section>
			{/if}

			{#if options.award && report}
				<section class="part">
					<h3>{report.rules.peakAwardName} · {Math.round(peakAwardPercent(report))}%</h3>
					<ul class="plain checklist">
						{#each report.peakAwardTasks as task (task.key)}
							<li class:done={task.done}>
								<span class="mark">{task.done ? '✓' : '○'}</span>
								{task.title}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if options.oas}
				<section class="part">
					<h3>Outdoor Adventure Skills</h3>
					{#if stages.length === 0}
						<p class="muted">No stages started yet.</p>
					{/if}
					{#each groupBy(stages, (s) => s.streamDisplay) as group (group.key)}
						<div class="stream">
							<h4>{group.key}</h4>
							{#each group.items as stage (stage.stage)}
								<div class="stage">
									<div class="stage-line">
										<span>Stage {stage.stage}</span>
										<span class="muted">
											{STATUS_TEXT[stage.status]}{stage.awarded
												? ` ${dateText(stage.awarded)}`
												: ''}
											{#if stage.status === 'started'}
												· {stage.statements.filter((s) => s.achieved).length} of {stage.statements
													.length}
											{/if}
										</span>
									</div>
									{#if shownStatements(stage).length > 0}
										<ul class="plain statements">
											{#each shownStatements(stage) as statement, i (i)}
												<li class:done={statement.achieved}>
													<span class="mark">{statement.achieved ? '✓' : '○'}</span>
													{statement.label}
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</section>
			{/if}

			{#if options.sia}
				<section class="part">
					<h3>Special interest areas</h3>
					{#if details.siaSummaries.length === 0}
						<p class="muted">None yet.</p>
					{:else}
						<ul class="plain">
							{#each details.siaSummaries as sia, i (i)}
								<li>
									<strong>{sia.area}</strong>{sia.project ? `: ${sia.project}` : ''}
									<span class="muted"
										>· {sia.status}{sia.updated ? ` ${shortDate(sia.updated)}` : ''}</span
									>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			{#if options.logbook}
				<section class="part">
					<h3>Logbook</h3>
					<p>
						{details.stats.nightsCamped} nights camped and {details.stats.kmsHiked} km hiked.
					</p>
				</section>
			{/if}

			{#if options.note}
				<section class="part">
					<h3>From the leader</h3>
					<textarea
						class="form-control note no-print"
						rows="3"
						placeholder="A note for {member.firstName}'s parents (optional)"
						bind:value={notes[member.id]}></textarea>
					<p class="note-print">{notes[member.id] ?? ''}</p>
				</section>
			{/if}

			{#if options.signatures}
				<div class="signatures">
					<div>Leader</div>
					<div>Parent</div>
				</div>
			{/if}
		</article>
	{/if}
{/each}

<style>
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		min-height: 44px;
		margin: -0.6rem 0 -0.2rem -0.2rem;
		color: var(--tint);
		text-decoration: none;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 0 0.75rem;
	}

	.choices h3 {
		margin: 0 0 0.25rem;
		font-size: 1rem;
	}

	.choose-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 40px;
	}

	.check.indent {
		padding-left: 1.6rem;
	}

	/* The report: on screen a card per youth, printed a page each */
	.report {
		margin: 1rem 0;
		padding: 1.25rem 1.25rem 1rem;
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
	}

	.report-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.6rem;
		border-bottom: 2px solid var(--brand);
	}

	.report-kicker {
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.report-name {
		margin: 0.1rem 0;
		font-size: 1.6rem;
	}

	.report-date {
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
		gap: 0.5rem;
		margin: 0.9rem 0 0.25rem;
	}

	.tile {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
	}

	.tile-label {
		color: var(--muted);
		font-size: 0.72rem;
	}

	.tile-value {
		font-size: 1.15rem;
		font-weight: 700;
	}

	.part {
		margin-top: 0.9rem;
		break-inside: avoid;
	}

	.part h3 {
		margin: 0 0 0.3rem;
		font-size: 1.05rem;
	}

	.part p,
	.part ul {
		margin: 0;
	}

	.plain {
		padding: 0;
		list-style: none;
	}

	.plain li + li {
		margin-top: 0.15rem;
	}

	.needs {
		margin-top: 0.4rem;
		font-size: 0.9rem;
	}

	.needs td {
		padding: 0.05rem 1.5rem 0.05rem 0;
	}

	.checklist,
	.statements {
		font-size: 0.92rem;
	}

	.checklist {
		columns: 2 14rem;
		column-gap: 1.5rem;
	}

	.checklist li {
		break-inside: avoid;
	}

	.mark {
		display: inline-block;
		width: 1.1rem;
		color: var(--muted);
		font-weight: 700;
	}

	li.done .mark {
		color: var(--success);
	}

	.stream {
		break-inside: avoid;
	}

	.stream + .stream {
		margin-top: 0.5rem;
	}

	.stream h4 {
		margin: 0;
		font-size: 0.95rem;
	}

	.stage-line {
		display: flex;
		gap: 0.6rem;
	}

	.statements {
		margin: 0.15rem 0 0.35rem 1rem;
		columns: 2 18rem;
		column-gap: 1.5rem;
	}

	.statements li {
		break-inside: avoid;
	}

	.note-print {
		display: none;
		white-space: pre-wrap;
	}

	.signatures {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-top: 2.5rem;
	}

	.signatures div {
		padding-top: 0.3rem;
		border-top: 1px solid var(--text);
		color: var(--muted);
		font-size: 0.85rem;
	}

	@media print {
		.report {
			margin: 0;
			padding: 0;
			break-after: page;
		}

		.report:last-of-type {
			break-after: auto;
		}

		.note-print {
			display: block;
			min-height: 4.5em;
		}
	}
</style>
