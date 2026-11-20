<!--
	Progress reports to print and hand to parents: one page per youth, with the parts the leader ticks.
	Reached from Progress (every youth) or a youth's details (just them), with ?ids= naming who's ticked.
-->
<script lang="ts">
	// Scouts Australia's typeface, from the Brand Book, served with Beacon rather than from a font service
	import '@fontsource-variable/nunito-sans';
	import { flushSync, onMount } from 'svelte';
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import BackLink from '#lib/components/BackLink.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { SCOUTS_DARK_GREY, SCOUTS_NAVY, sectionColours } from '#lib/model/brandColours.js';
	import { shortDate, today, toCalendarDate } from '#lib/model/dates.js';
	import {
		milestoneRemaining,
		milestoneTotal,
		peakAwardPercent,
		type MemberInsightsReport
	} from '#lib/model/insights/memberModels.js';
	import type { PriorityTask } from '#lib/model/insights/models.js';
	import { offersSectionLogos, type ReportOptions } from '#lib/model/report.js';
	import { asc, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, insights, members, progress, reports } from '#lib/services/index.js';
	import type { MemberSummary } from '#lib/services/members.js';
	import {
		milestoneInProgress,
		milestoneNeedsOf,
		type ProgressDetails
	} from '#lib/services/progress.js';
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
		{ key: 'achievedStatements', label: 'Achieved "I" statements', under: 'oas' },
		{ key: 'notYetStatements', label: '"I" statements still to do', under: 'oas' },
		{ key: 'nonCoreOAS', label: 'Non-core streams', under: 'oas' },
		{ key: 'sia', label: 'Special interest areas' },
		{ key: 'logbook', label: 'Logbook (the summary has it too)' },
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
	// Printing double-sided, the youth whose report takes an odd number of pages, to follow with a blank one
	let blankAfter = $state<string[]>([]);
	let reportsElement = $state<HTMLElement>();

	/*
		The blank pages are worked out whenever the reports change, a moment after, so they're in place
		however printing starts: not every browser says it's about to print (Safari on an iPhone doesn't
		when printing from the share sheet). They're worked out again just before printing where the
		browser does say, and by the Print button
	*/
	const placeBlankPages = () => (blankAfter = options.doubleSided ? oddReports() : []);
	$effect(() => {
		// What changes a report's length: the parts included, who's included and their data, and notes
		JSON.stringify([options, chosen, Object.keys(prepared), notes]);
		const timer = setTimeout(() => void document.fonts.ready.then(placeBlankPages), 300);
		return () => clearTimeout(timer);
	});
	onMount(() => {
		const before = () => flushSync(placeBlankPages);
		addEventListener('beforeprint', before);
		return () => removeEventListener('beforeprint', before);
	});
	function print() {
		flushSync(placeBlankPages);
		window.print();
	}

	// The printed page's height, A4's 297mm less the 0.2in margins set below, in CSS pixels; less a little for what keeping headings and stages together pushes over to the next page
	const PAGE_HEIGHT = ((297 - 2 * 5.08) / 25.4) * 96 - 40;
	const pagesFor = (height: number) => Math.max(1, Math.ceil((height - 2) / PAGE_HEIGHT));

	/**
	 * Browsers don't support starting each report on a right-hand page, so measure each one laid out as
	 * it prints: its front page and its statements, which start a page of their own
	 */
	function oddReports(): string[] {
		if (!reportsElement) return [];
		reportsElement.classList.add('measuring');
		// Nothing follows the last report, so it needs no blank page
		const odd = [...reportsElement.querySelectorAll<HTMLElement>('.report')]
			.slice(0, -1)
			.filter((report) => {
				const statements = report.querySelector<HTMLElement>('.statements-page');
				const total = report.getBoundingClientRect().height;
				const statementsHeight = statements?.getBoundingClientRect().height ?? 0;
				const pages =
					pagesFor(total - statementsHeight) + (statements ? pagesFor(statementsHeight) : 0);
				return pages % 2 === 1;
			})
			.map((report) => report.dataset.member ?? '');
		reportsElement.classList.remove('measuring');
		return odd;
	}
	const settings = readInsightsSettings();
	// In colour, the unit's section colours with Scouts Australia's navy, as in the Brand Book
	const colours = $derived(sectionColours(app.section));
	// The section's logo from the Brand Centre, reversed on the navy band or black; for now only offered
	// to the members trying it out
	const SECTION_LOGOS: Record<string, { colour: string; black: string }> = {
		joey: {
			colour: asset('section-logos/joey-colour.png'),
			black: asset('section-logos/joey-black.png')
		},
		cub: {
			colour: asset('section-logos/cub-colour.png'),
			black: asset('section-logos/cub-black.png')
		},
		scout: {
			colour: asset('section-logos/scout-colour.png'),
			black: asset('section-logos/scout-black.png')
		},
		venturer: {
			colour: asset('section-logos/venturer-colour.png'),
			black: asset('section-logos/venturer-black.png')
		},
		rover: {
			colour: asset('section-logos/rover-colour.png'),
			black: asset('section-logos/rover-black.png')
		}
	};
	const logosOffered = $derived(offersSectionLogos(app.memberNumber));
	const logo = $derived.by(() => {
		const logos = SECTION_LOGOS[app.section];
		if (!logosOffered || !options.logos || !logos) return '';
		return options.colour ? logos.colour : logos.black;
	});
	const SECTION_NAMES: Record<string, string> = {
		joey: 'Joey Scouts',
		cub: 'Cub Scouts',
		scout: 'Scouts',
		venturer: 'Venturer Scouts',
		rover: 'Rover Scouts'
	};
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
	/**
		How far through each award item they are, for parents: counts for stage progressions and projects,
		where each core stream is up to, and when one-off items were done. The introductions aren't shown:
		every youth has done them by the time a report goes home.
	*/
	function taskProgress(
		task: PriorityTask,
		details: ProgressDetails,
		report: MemberInsightsReport
	) {
		const rules = report.rules;
		switch (task.key) {
			case 'milestone':
				return `${details.milestones.filter((m) => m.awarded).length} of 3 done`;
			case 'oas':
				return `${Math.min(details.stats.oasProgressions, rules.oasStageProgressionsRequired)} of ${rules.oasStageProgressionsRequired} done`;
			case 'oas:high':
				return task.detail ? `${task.detail} done` : '';
			case 'oas:core':
				return task.done ? '' : task.detail.replace(/^Below Stage \d+: /, 'Now at ');
			case 'sia': {
				const completed = details.siaSummaries.filter((s) => s.status === 'Awarded').length;
				const inProgress = details.siaSummaries.length - completed;
				const areas = /(\d+ of \d+ areas)/.exec(task.detail)?.[1];
				return [
					`${completed} of ${rules.siaProjectsRequired} completed`,
					inProgress > 0 ? `${inProgress} in progress` : '',
					rules.siaAreasRequired > 1 && areas ? areas : ''
				]
					.filter(Boolean)
					.join(', ');
			}
			case 'peak:course':
				return shortDate(details.peakAward.personalDevelopmentCourse);
			case 'peak:aj':
				return shortDate(details.peakAward.adventurousJourney);
			case 'peak:reflection':
				return shortDate(details.peakAward.personalReflection);
			default:
				return task.done ? '' : task.detail;
		}
	}

	// Working on more than one, the summary counts milestones done rather than one milestone's activities
	const severalMilestones = (details: ProgressDetails) =>
		details.milestones.filter(milestoneInProgress).length > 1;

	const milestonesComplete = (details: ProgressDetails) =>
		details.milestones.filter((m) => m.awarded).length >= 3;
</script>

<svelte:head>
	<title>Beacon / Progress reports</title>
</svelte:head>

<div class="no-print">
	<BackLink href={pagePath('progress/')} label="Youth" />
	<div class="head">
		<h2>Progress reports</h2>
		<button type="button" class="btn btn-primary" disabled={ready === 0} onclick={print}
			><Icon name="print" /> Print</button
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

	<div class="choices card-grid">
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
			<h3 class="printing">Printing</h3>
			<label class="check">
				<input type="checkbox" class="form-check-input" bind:checked={options.doubleSided} />
				Double-sided: each report starts on a new sheet
			</label>
			<div class="colour-choice" role="radiogroup" aria-label="Print in">
				<label class="check">
					<input
						type="radio"
						class="form-check-input"
						name="report-colour"
						checked={options.colour}
						onchange={() => (options.colour = true)}
					/>
					Colour
				</label>
				<label class="check">
					<input
						type="radio"
						class="form-check-input"
						name="report-colour"
						checked={!options.colour}
						onchange={() => (options.colour = false)}
					/>
					Black and white
				</label>
			</div>
			{#if logosOffered}
				<label class="check">
					<input type="checkbox" class="form-check-input" bind:checked={options.logos} />
					Section logo
				</label>
			{/if}
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

<div class="reports" bind:this={reportsElement}>
	{#each youth.filter((y) => chosen.includes(y.id)) as member (member.id)}
		{@const data = prepared[member.id]}
		{#if data === 'failed'}
			<div class="alert alert-danger no-print">
				Couldn't load {nameOf(member)}'s progress from Terrain.
			</div>
		{:else if data}
			{@const { details, report, stages } = data}
			<article
				class="report"
				class:colour={options.colour}
				data-member={member.id}
				style:--section={colours.primary}
				style:--section-dark={colours.dark}
				style:--navy={SCOUTS_NAVY}
				style:--ink={SCOUTS_DARK_GREY}
			>
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
					<div class="report-side">
						{#if logo}
							<img class="section-logo" src={logo} alt={SECTION_NAMES[app.section]} />
						{/if}
						<div class="report-date muted">{printedOn}</div>
					</div>
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
								{report?.milestone && !milestonesComplete(details) && !severalMilestones(details)
									? `Milestone ${report.milestone.number}`
									: 'Milestones'}
							</div>
							<div class="tile-value">
								{#if milestonesComplete(details)}
									Completed
								{:else if report?.milestone && !severalMilestones(details)}
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
							<!-- What each milestone being worked on still needs: a youth can work on more than one -->
							<ul class="plain">
								{#each details.milestones as milestone (milestone.milestone)}
									{@const needs = milestoneInProgress(milestone)
										? milestoneNeedsOf(milestone)
										: null}
									<li>
										<strong>Milestone {milestone.milestone}</strong>
										{milestone.awarded
											? `awarded ${shortDate(milestone.awarded)}`
											: milestone.status.toLowerCase()}
										{#if needs}
											<div class="needs muted">
												{[...needs.participates, needs.leads]
													.map(
														(need) =>
															`${AREAS[need.challengeArea] ?? need.challengeArea} ${Math.min(need.have, need.need)} of ${need.need}`
													)
													.join(' · ')}
											</div>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/if}

				{#if options.award && report}
					<section class="part">
						<h3>{report.rules.peakAwardName} · {Math.round(peakAwardPercent(report))}%</h3>
						<ul class="plain checklist">
							{#each report.peakAwardTasks.filter((t) => !t.key.startsWith('intro:')) as task (task.key)}
								{@const progress = taskProgress(task, details, report)}
								<li class:done={task.done}>
									<span class="mark">{task.done ? '✓' : '○'}</span>
									<span>
										{task.title}
										{#if progress}<span class="task-progress muted">{progress}</span>{/if}
									</span>
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
						{:else}
							<table class="oas">
								<thead>
									<tr><th>Stream</th><th>Completed</th><th>Working on</th></tr>
								</thead>
								<tbody>
									{#each groupBy(stages, (s) => s.streamDisplay) as group (group.key)}
										{@const done = group.items.filter((s) => s.status !== 'started').at(-1)}
										<tr>
											<td>{group.key}</td>
											<td>
												{#if done}
													Stage {done.stage}
													<span class="muted">{dateText(done.awarded)}</span>
												{:else}
													<span class="muted">–</span>
												{/if}
											</td>
											<td>
												{#each group.items.filter((s) => s.status === 'started') as stage, i (stage.stage)}
													{i > 0 ? ', ' : ''}Stage {stage.stage}
													<span class="muted"
														>{stage.statements.filter((s) => s.achieved).length} of {stage
															.statements.length}</span
													>
												{:else}
													<span class="muted">–</span>
												{/each}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
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

				{#if options.logbook && !options.summary}
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

				{#if options.oas && stages.some((stage) => shownStatements(stage).length > 0)}
					<section class="statements-page">
						<header class="statements-head">
							<h3>{nameOf(member)} · Outdoor Adventure Skills</h3>
							<div class="muted small">
								{options.achievedStatements && options.notYetStatements
									? '✓ achieved · ○ still to do'
									: options.achievedStatements
										? '"I" statements achieved'
										: '"I" statements still to do'}
							</div>
						</header>
						{#each groupBy(stages, (s) => s.streamDisplay) as group (group.key)}
							{#if group.items.some((stage) => shownStatements(stage).length > 0)}
								<div class="stream">
									<h4>{group.key}</h4>
									{#each group.items.filter((stage) => shownStatements(stage).length > 0) as stage (stage.stage)}
										<div class="stage">
											<div class="stage-line">
												<span>Stage {stage.stage}</span>
												<span class="muted">
													{STATUS_TEXT[stage.status]}{stage.awarded
														? ` ${dateText(stage.awarded)}`
														: ''}
													{#if stage.status === 'started'}
														· {stage.statements.filter((s) => s.achieved).length} of {stage
															.statements.length}
													{/if}
												</span>
											</div>
											<ul class="plain statements">
												{#each shownStatements(stage) as statement, i (i)}
													<li class:done={statement.achieved}>
														<span class="mark">{statement.achieved ? '✓' : '○'}</span>
														{statement.label}
													</li>
												{/each}
											</ul>
										</div>
									{/each}
								</div>
							{/if}
						{/each}
					</section>
				{/if}
			</article>
			{#if blankAfter.includes(member.id)}
				<div class="blank-page" aria-hidden="true">&nbsp;</div>
			{/if}
		{/if}
	{/each}
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.choices {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
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

	/*
		The report: on screen a card per youth, printed a page each. It's paper, white in dark mode too, so
		what's on screen is what prints: in black and white, or in colour, with the unit's section colour and
		Scouts Australia's navy and dark grey (brandColours.ts). Its own colours stand in for the app's here
	*/
	.report {
		--text: #000;
		--muted: #555;
		--border: #bbb;
		--success: #000;
		/* Bars and rules; ticks and stream names; headings */
		--accent: #000;
		--accent-text: #000;
		--heading: #000;
		margin: 1rem 0;
		padding: 1.25rem 1.25rem 1rem;
		border: 1px solid #d6d6d4;
		border-radius: var(--radius-lg);
		background: #fff;
		color: var(--text);
		/* Nunito Sans, Scouts Australia's typeface */
		font-family: 'Nunito Sans Variable', 'Nunito Sans', system-ui, sans-serif;
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}

	.report.colour {
		--text: var(--ink);
		--muted: #6f6f6e;
		--border: #d6d6d4;
		--success: var(--section-dark);
		--accent: var(--section);
		--accent-text: var(--section-dark);
		--heading: var(--navy);
		overflow: hidden;
	}

	.report-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.6rem;
		border-bottom: 2px solid var(--heading);
	}

	/* In colour, a navy band across the top, edged in the section's colour */
	.colour .report-head {
		margin: -1.25rem -1.25rem 0;
		padding: 1rem 1.25rem 0.8rem;
		border-bottom: 6px solid var(--accent);
		background: var(--heading);
		color: #fff;
	}

	.colour .report-head .muted,
	.colour .report-kicker {
		color: rgb(255 255 255 / 0.82);
	}

	.note {
		border-color: var(--border);
		font-family: inherit;
		background: #fff;
		color: var(--text);
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

	/* The section's logo, above the date at the top right */
	.report-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.35rem;
	}

	.section-logo {
		display: block;
		width: auto;
		height: 2.6rem;
		max-width: 11rem;
		object-fit: contain;
		object-position: right;
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

	.colour .tile {
		border-top: 4px solid var(--accent);
	}

	.colour .tile-value {
		color: var(--heading);
	}

	.tile-label {
		color: var(--muted);
		font-size: 0.72rem;
	}

	.tile-value {
		font-size: 1.15rem;
		font-weight: 700;
	}

	/* Long parts (OAS with its statements) run on over pages; headings stay with what follows them */
	.part {
		margin-top: 0.75rem;
	}

	.part h3,
	.stream h4,
	.stage-line {
		break-after: avoid;
	}

	.part h3 {
		margin: 0 0 0.3rem;
		color: var(--heading);
		font-size: 1.05rem;
	}

	.colour .part h3 {
		padding-left: 0.45rem;
		border-left: 4px solid var(--accent);
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
		margin-top: 0.15rem;
		font-size: 0.9rem;
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

	/* How far through an award item they are, under its name */
	.task-progress {
		display: block;
		font-size: 0.82rem;
	}

	/* A tick or circle beside each item, wrapped lines indented to the text */
	.checklist li,
	.statements li {
		display: flex;
		gap: 0.15rem;
	}

	.mark {
		display: inline-block;
		flex-shrink: 0;
		width: 1.1rem;
		color: var(--muted);
		font-weight: 700;
	}

	li.done .mark {
		color: var(--success);
	}

	.stream + .stream {
		margin-top: 0.5rem;
	}

	.stream h4 {
		margin: 0;
		color: var(--accent-text);
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

	.oas {
		font-size: 0.92rem;
		border-collapse: collapse;
	}

	.oas th {
		padding: 0 1.5rem 0.15rem 0;
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 600;
		text-align: left;
	}

	.oas td {
		padding: 0.1rem 1.5rem 0.1rem 0;
		vertical-align: top;
	}

	/* The statements start a page of their own, headed so it makes sense on its own */
	.statements-page {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--border);
	}

	.statements-head {
		margin-bottom: 0.6rem;
		padding-bottom: 0.4rem;
		border-bottom: 2px solid var(--accent);
		break-after: avoid;
	}

	.statements-head h3 {
		margin: 0;
		color: var(--heading);
		font-size: 1.15rem;
	}

	.note-print {
		display: none;
		white-space: pre-wrap;
	}

	.signatures {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-top: 1.5rem;
		break-inside: avoid;
	}

	.signatures div {
		padding-top: 0.3rem;
		border-top: 1px solid var(--text);
		color: var(--muted);
		font-size: 0.85rem;
	}

	.printing {
		margin-top: 0.75rem;
	}

	.colour-choice {
		display: flex;
		flex-wrap: wrap;
		column-gap: 1.25rem;
	}

	.blank-page {
		display: none;
	}

	/* Laid out as printed, to count each report's pages; the same as the print rules below */
	:global(.measuring) .report {
		/* A4's 210mm less the 0.2in margins */
		width: calc(210mm - 0.4in);
		margin: 0;
		padding: 0;
		font-size: 0.94rem;
	}

	:global(.measuring) .colour .report-head,
	:global(.measuring) .report {
		border: 0;
	}

	:global(.measuring) .colour .report-head {
		margin: 0;
		padding: 0.8rem 1rem 0.7rem;
		border-bottom: 6px solid var(--accent);
	}

	:global(.measuring) .statements-page {
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}

	:global(.measuring) .note {
		display: none;
	}

	:global(.measuring) .note-print {
		display: block;
		min-height: 2em;
	}

	@page {
		/* A4, which the pages are counted for when printing double-sided */
		size: A4;
		/* Narrow, so each page holds more: 0.2in all round */
		margin: 0.2in;
	}

	/*
		Phones can lay the printed page out narrower than a computer does: Safari on an iPhone counts a CSS
		pixel as a printer's point, so A4 is about 530px across instead of 700. The report then wraps into
		more lines and runs over the page, so scale it to the same size on paper as a computer prints it.
	*/
	@media print and (max-width: 640.98px) {
		.report {
			zoom: 0.75;
		}
	}

	@media print and (max-width: 480px) {
		.report {
			zoom: 0.55;
		}
	}

	@media print {
		/* A page on its own, kept by browsers that skip an empty one; page-break-* for older Safari */
		.blank-page {
			display: block;
			height: 1px;
			overflow: hidden;
			break-after: page;
			page-break-after: always;
		}

		.report {
			margin: 0;
			padding: 0;
			/* A touch smaller on paper, so the front page holds everything */
			font-size: 0.94rem;
			border: 0;
			border-radius: 0;
			break-after: page;
			page-break-after: always;
		}

		/* The band runs the width of the printed area, rounded a little */
		.colour .report-head {
			margin: 0;
			padding: 0.8rem 1rem 0.7rem;
			border-radius: 0.4rem 0.4rem 0 0;
		}

		.report:last-of-type {
			break-after: auto;
			page-break-after: auto;
		}

		/* The page's margins are enough on paper, and the room for the phone's tab bar isn't needed */
		:global(main) {
			padding: 0 !important;
		}

		:global(.page) {
			min-height: 0;
		}

		.statements-page {
			margin-top: 0;
			padding-top: 0;
			border-top: 0;
			break-before: page;
			page-break-before: always;
		}

		.note-print {
			display: block;
			min-height: 2em;
		}
	}
</style>
