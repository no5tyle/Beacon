<!--
	Insights: the unit's OAS gaps, who is moving up soon and what's outstanding for them, and what to
	programme next. Built from every youth's progress, which usually loads in the background after login.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import { pagePath } from '#lib/paths.js';
	import { monthYear } from '#lib/model/dates.js';
	import { STREAMS } from '#lib/model/insights/insightsCalculator.js';
	import {
		activeOutstandingCount,
		activeOutstandingPercent,
		candidateOutstandingCount,
		completionPercent,
		outstandingCount,
		outstandingPercent,
		type InsightsReport,
		type RequirementGap,
		type TaskCategory,
		type Urgency
	} from '#lib/model/insights/models.js';
	import { rulesFor, type SectionRules } from '#lib/model/insights/settings.js';
	import { asc, compareText, desc, formatOneDecimal, sortBy } from '#lib/model/util.js';
	import { app, insights, members, unitProgress } from '#lib/services/index.js';
	import {
		focusKey,
		readFocusIds,
		readInsightsSettings,
		saveInsightsSettings,
		writeSetting
	} from '#lib/stores/storage.js';

	type Tab = 'gaps' | 'moving-up' | 'programme';

	// How many of the most needed requirements each missing requirements table shows
	const MOST_COMMON_LIMIT = 20;
	const STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

	// The filters chosen earlier in this browser tab, if any
	let settings = $state(readInsightsSettings());
	let report = $state<InsightsReport | null>(null);
	let analysing = $state(false);
	let errorMessage = $state('');
	let showFilters = $state(false);
	let tab = $state<Tab>('gaps');
	let expandedStreams = $state<string[]>([]);
	let expandedThemes = $state<string[]>([]);
	let expandedGaps = $state<string[]>([]);
	// Focus youth are treated like youth moving up soon. The picks are kept on this device per unit
	let unitYouth = $state<{ id: string; name: string }[]>([]);
	let focusIds = $state<string[]>([]);
	let suppressLastName = $state(app.suppressLastName);
	let loadProgress = $state({ done: 0, total: 0 });

	const unitId = $derived(app.unitId);
	const sectionRules: SectionRules = $derived(rulesFor(settings, app.section));
	const loadingYouth = $derived(analysing && !unitProgress.isCached(unitId));

	onMount(() =>
		unitProgress.onProgress(() => {
			loadProgress = unitProgress.loadProgress(unitId);
		})
	);

	// Analyse as soon as the page opens, and again when the unit changes
	$effect(() => {
		const id = unitId;
		report = null;
		if (!id) return;
		loadFocusYouth(id).then(() => analyse());
	});

	async function loadFocusYouth(id: string) {
		unitYouth = [];
		focusIds = [];
		try {
			const youth = sortBy(
				await members.youth(id),
				asc((m) => m.firstName),
				asc((m) => m.lastName)
			);
			unitYouth = youth.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }));
			focusIds = readFocusIds(id).filter((s) => unitYouth.some((y) => y.id === s));
		} catch (error) {
			console.warn('Insights: unable to load focus youth', error);
		}
	}

	function toggleFocus(memberId: string) {
		focusIds = focusIds.includes(memberId)
			? focusIds.filter((id) => id !== memberId)
			: [...focusIds, memberId];
		saveFocusAndRebuild();
	}

	function clearFocus() {
		focusIds = [];
		saveFocusAndRebuild();
	}

	function saveFocusAndRebuild() {
		writeSetting(focusKey(unitId), JSON.stringify(focusIds));
		if (report)
			report =
				insights.rebuild(unitId, $state.snapshot(settings), $state.snapshot(focusIds)) ?? report;
	}

	async function analyse() {
		if (!unitId || analysing) return;
		analysing = true;
		errorMessage = '';
		app.suppressLastName = suppressLastName;
		try {
			const used = $state.snapshot(settings);
			// Remembered for the rest of the tab, so a stage's analysis and youth details use the same filters
			saveInsightsSettings(used);
			report = await insights.report(unitId, used, $state.snapshot(focusIds));
			if (report.youthCount === 0) errorMessage = 'No youth members found for this unit.';
		} catch (error) {
			console.error('Insights: analysis failed', error);
			errorMessage = 'Unable to analyse the unit. Check Terrain is responding, then tap Refresh.';
		}
		analysing = false;
	}

	// Fetch every youth's progress from Terrain again, e.g. after changes made in Terrain itself
	async function refresh() {
		if (analysing || !unitId) return;
		unitProgress.clear(unitId);
		await analyse();
	}

	function applyFilters() {
		showFilters = false;
		analyse();
	}

	// Settings that differ from the defaults, shown as a count on the Filters button
	const activeFilterCount = $derived(
		(focusIds.length > 0 ? 1 : 0) +
			(settings.includeNonCoreOAS ? 1 : 0) +
			(settings.sectionStagesOnly ? 0 : 1) +
			(suppressLastName ? 1 : 0)
	);

	function stageRangeDisplay(rules: SectionRules): string {
		const low = Math.max(1, rules.lowestStageShown);
		const high = Math.min(Math.max(rules.highestStageShown, low), 9);
		return low === high ? `Stage ${low}` : `Stages ${low}-${high}`;
	}

	const toggle = (list: string[], key: string) =>
		list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

	const memberName = (memberId: string) => report?.memberNames[memberId] ?? memberId;
	const byName = (ids: readonly string[]) =>
		[...ids].sort((a, b) => compareText(memberName(a), memberName(b)));
	const candidateFor = (memberId: string) =>
		report?.moveUpCandidates.find((c) => c.memberId === memberId);
	const isMovingUp = (memberId: string) => candidateFor(memberId) !== undefined;
	const priorityBadge = (memberId: string) => {
		const candidate = candidateFor(memberId);
		return !candidate ? '' : candidate.isMovingUp ? 'moving up' : 'focus';
	};

	const gapKey = (gap: RequirementGap) =>
		`${gap.stream}/${gap.stage}/${gap.inputGroup}/${gap.inputLabel}`;

	// Stream in the usual OAS order, then stage, then Plan > Do > Review, keeping the most needed first within that
	const GROUP_ORDER = ['Plan', 'Do', 'Review'];
	const groupIndex = (group: string) =>
		GROUP_ORDER.includes(group) ? GROUP_ORDER.indexOf(group) : GROUP_ORDER.length;
	const sortByStreamAndStage = (gaps: RequirementGap[]) =>
		sortBy(
			gaps,
			asc((g) => STREAMS.findIndex((s) => s.key === g.stream)),
			asc((g) => g.stage),
			asc((g) => groupIndex(g.inputGroup))
		);

	const gapGroups = $derived(
		report
			? [
					{
						title: 'Unit night',
						note: 'Can be done at a regular meeting.',
						gaps: report.requirementGaps.filter((g) => g.unitNightSuitable)
					},
					{
						title: 'Overnight activity required',
						note: 'Needs an outing such as a hike or camp, including some day outings.',
						gaps: report.requirementGaps.filter((g) => !g.unitNightSuitable)
					}
				]
			: []
	);

	function heatClass(reached: number, youthCount: number): string {
		if (youthCount === 0 || reached === 0) return 'heat-0';
		const ratio = reached / youthCount;
		if (ratio >= 0.75) return 'heat-4';
		if (ratio >= 0.5) return 'heat-3';
		if (ratio >= 0.25) return 'heat-2';
		return 'heat-1';
	}

	const urgencyClass = (urgency: Urgency) =>
		urgency === 'High'
			? 'badge'
			: urgency === 'Medium'
				? 'badge badge-warning'
				: 'badge badge-muted';

	const categoryDisplay = (category: TaskCategory) =>
		category === 'PeakAward' ? 'Peak award' : category;

	function monthsDisplay(months: number | null): string {
		if (months === null) return 'no birth date';
		if (months < 0) return 'Due to move up';
		return `${formatOneDecimal(months)} mths`;
	}

	const percent = (fraction: number) => Math.round(fraction * 100);
	const coreOnly = $derived(report?.streamCoverage.every((s) => s.isCore) ?? true);
	const movingUpCount = $derived(report?.moveUpCandidates.filter((c) => c.isMovingUp).length ?? 0);
	const topArea = $derived(
		report?.challengeAreaDeficits.find((d) => d.challengeArea !== 'Lead / Assist')
	);
	const maxDeficit = $derived(
		Math.max(1, ...(report?.challengeAreaDeficits.map((d) => d.participatesShort) ?? []))
	);
</script>

<svelte:head>
	<title>Beacon / Insights</title>
</svelte:head>

<div use:pullToRefresh={refresh}>
	<div class="insights-header">
		<h2>Insights</h2>
		<div class="toolbar">
			<button
				type="button"
				class="btn icon-btn {showFilters ? 'btn-primary' : 'btn-outline-primary'}"
				onclick={() => (showFilters = !showFilters)}
				title="Filters"
				aria-label="Filters{activeFilterCount > 0 ? `, ${activeFilterCount} set` : ''}"
				aria-expanded={showFilters}
			>
				<Icon name="list" />
				{#if activeFilterCount > 0}
					<span class="filter-count" aria-hidden="true">{activeFilterCount}</span>
				{/if}
			</button>
			<button
				type="button"
				class="btn icon-btn btn-outline-secondary"
				onclick={refresh}
				disabled={analysing || !unitId}
				title="Load every youth's progress from Terrain again"
				aria-label="Refresh"
			>
				<Icon name="reload" />
			</button>
		</div>
	</div>

	{#if !unitId}
		<ChooseUnit />
	{/if}

	{#if showFilters}
		<div class="filters-panel">
			<div class="filters-section">
				<div class="section-title">
					<strong>Focus youth</strong>
					{#if focusIds.length > 0}
						<button type="button" class="btn btn-link btn-sm" onclick={clearFocus}>Clear</button>
					{/if}
				</div>
				<div class="small muted">
					Treated like youth moving up soon. Changes apply straight away.
				</div>
				<div class="focus-list">
					{#each unitYouth as youth (youth.id)}
						<label class="filter-row">
							<input
								type="checkbox"
								class="form-check-input"
								checked={focusIds.includes(youth.id)}
								onchange={() => toggleFocus(youth.id)}
							/>
							<span>{youth.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="filters-section">
				<strong>Show</strong>
				<label class="filter-row">
					<input
						id="includeNonCore"
						type="checkbox"
						class="form-check-input"
						bind:checked={settings.includeNonCoreOAS}
					/>
					<span>Include non-core OAS streams</span>
				</label>
				<label class="filter-row">
					<input
						id="hideLower"
						type="checkbox"
						class="form-check-input"
						bind:checked={settings.sectionStagesOnly}
					/>
					<span>Only the section's stages ({stageRangeDisplay(sectionRules)})</span>
				</label>
				<label class="filter-row">
					<input
						id="suppressLastName"
						type="checkbox"
						class="form-check-input"
						bind:checked={suppressLastName}
					/>
					<span>Hide last names</span>
				</label>
			</div>

			<details class="filters-section">
				<summary><strong>Advanced settings</strong></summary>
				<div class="advanced">
					<label class="small"
						>Moving up window (months)<input
							type="number"
							class="form-control"
							bind:value={settings.moveUpWindowMonths}
						/></label
					>
					<label class="small"
						>Move up age (years)<input
							type="number"
							class="form-control"
							bind:value={sectionRules.moveUpAgeYears}
						/></label
					>
					<label class="small"
						>OAS stage progressions for peak award<input
							type="number"
							class="form-control"
							bind:value={sectionRules.oasStageProgressionsRequired}
						/></label
					>
					<label class="small"
						>Minimum stage in core OAS<input
							type="number"
							class="form-control"
							bind:value={sectionRules.coreStageRequired}
						/></label
					>
					<label class="small"
						>SIA projects for peak award<input
							type="number"
							class="form-control"
							bind:value={sectionRules.siaProjectsRequired}
						/></label
					>
					<label class="small"
						>SIA areas for peak award<input
							type="number"
							class="form-control"
							bind:value={sectionRules.siaAreasRequired}
						/></label
					>
					<label class="small"
						>Lowest OAS stage shown<input
							type="number"
							class="form-control"
							bind:value={sectionRules.lowestStageShown}
						/></label
					>
					<label class="small"
						>Highest OAS stage shown<input
							type="number"
							class="form-control"
							bind:value={sectionRules.highestStageShown}
						/></label
					>
					<label class="small"
						>OAS stages to analyse in detail<input
							type="number"
							class="form-control"
							bind:value={settings.maxGapStages}
						/></label
					>
				</div>
				<div class="small muted">
					Peak award OAS and SIA defaults follow the wording in Terrain. Move up age defaults are a
					starting point; check them against the current Scouts Australia requirements for {sectionRules.sectionDisplay ||
						'your section'}.
				</div>
			</details>

			<div class="filters-actions">
				<button
					type="button"
					class="btn btn-outline-secondary"
					onclick={() => (showFilters = false)}>Close</button
				>
				<button type="button" class="btn btn-primary" onclick={applyFilters} disabled={analysing}
					>Apply</button
				>
			</div>
		</div>
	{/if}

	{#if analysing}
		<div class="loading-note">
			{#if loadingYouth && loadProgress.total > 0}
				<div class="small">
					Loading youth {loadProgress.done} of {loadProgress.total} from Terrain...
				</div>
				<div class="bar thin">
					<div style:width="{Math.round((100 * loadProgress.done) / loadProgress.total)}%"></div>
				</div>
			{:else}
				<div class="small">Working out the unit's gaps...</div>
			{/if}
		</div>
	{/if}

	{#if errorMessage}
		<div class="alert alert-danger">{errorMessage}</div>
	{/if}

	{#if report && report.youthCount > 0}
		<div class="tiles">
			<div class="stat-tile">
				<div class="stat-label">Youth analysed</div>
				<div class="stat-value">{report.youthCount}</div>
			</div>
			<div class="stat-tile">
				<div class="stat-label">Moving up within {settings.moveUpWindowMonths} months</div>
				<div class="stat-value">{movingUpCount}</div>
				<div class="stat-note">
					{report.moveUpCandidates.filter((c) => c.isMovingUp && c.urgency === 'High').length} within
					3 months{report.moveUpCandidates.some((c) => !c.isMovingUp)
						? `, plus ${report.moveUpCandidates.filter((c) => !c.isMovingUp).length} focus youth`
						: ''}
				</div>
			</div>
		</div>

		<div class="tabs" role="tablist">
			<button type="button" role="tab" aria-selected={tab === 'gaps'} onclick={() => (tab = 'gaps')}
				>OAS gaps</button
			>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'moving-up'}
				onclick={() => (tab = 'moving-up')}
				>Priority<span class="wide-only">{' youth'}</span>
				<span class="badge">{report.moveUpCandidates.length}</span></button
			>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'programme'}
				onclick={() => (tab = 'programme')}>Programming</button
			>
		</div>

		{#if tab === 'gaps'}
			<h3>Unit completion</h3>
			<p class="muted">
				How many youth have completed each stage, out of {report.youthCount} youth. Click a stream to
				list each youth under the lowest stage they haven't completed, or a stage to see which of its
				statements to programme first. Pale rows are streams the unit is lacking.{coreOnly
					? ' Core streams only; turn on "Include non-core OAS streams" in Filters to see the others.'
					: ''}
			</p>
			<div class="table-scroll section-gap">
				<table class="table heatmap">
					<thead>
						<tr>
							<th>Stream</th>
							{#each STAGES as stage (stage)}<th class="center">Stage {stage}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each report.streamCoverage as stream (stream.stream)}
							{@const expanded = expandedStreams.includes(stream.stream)}
							<tr>
								<td>
									<button
										type="button"
										class="stream-toggle"
										onclick={() => (expandedStreams = toggle(expandedStreams, stream.stream))}
										title="Show youth by the lowest stage they haven't completed"
										aria-expanded={expanded}>{stream.streamDisplay} {expanded ? '▴' : '▾'}</button
									>
									{#if stream.isCore && !coreOnly}<span class="badge badge-light">core</span>{/if}
								</td>
								{#each STAGES as stage (stage)}
									{@const completed = stream.reachedStage[stage]}
									<td class="center {heatClass(completed, report.youthCount)}"
										><a
											class="stage-link"
											href={pagePath(`insights/stage/?stream=${stream.stream}&stage=${stage}`)}
											title="{completed} of {report.youthCount} youth have completed {stream.streamDisplay} Stage {stage}. Tap to see which statements to programme first"
											>{completed}/{report.youthCount}</a
										></td
									>
								{/each}
							</tr>
							{#if expanded}
								<tr class="stage-youth-row">
									<td class="small muted">Next stage for</td>
									{#each STAGES as stage (stage)}
										<td>
											<ul class="plain">
												{#each byName(stream.nextStageMemberIds[stage]) as memberId (memberId)}
													<li>{memberName(memberId)}</li>
												{/each}
											</ul>
										</td>
									{/each}
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			<h3>Most common missing requirements</h3>
			<p class="muted small">
				<strong>Working on it</strong>: youth who have started that stage in Terrain.
				<strong>All eligible</strong>: everyone who would benefit from an activity on that stage.
				That's youth who have already completed it, counted as done, plus youth who haven't and
				could get credit for it. Youth can work on several stages at once: Stages 1 to 3 any time,
				and higher stages once the stage three below is complete.
			</p>
			{#if report.requirementGaps.length === 0}
				<p class="muted">No requirement detail was found for the most needed stages.</p>
			{:else}
				{#each gapGroups as group (group.title)}
					<h4 class="gap-title">
						{group.title}
						<span class="badge badge-muted">{Math.min(group.gaps.length, MOST_COMMON_LIMIT)}</span>
					</h4>
					<p class="small muted">
						{group.note}{group.gaps.length > MOST_COMMON_LIMIT
							? ` Showing the ${MOST_COMMON_LIMIT} most needed of ${group.gaps.length}.`
							: ''}
					</p>
					{#if group.gaps.length === 0}
						<p class="muted small">None outstanding.</p>
					{:else}
						<div class="table-scroll section-gap">
							<table class="table stack-table gaps">
								<thead>
									<tr>
										<th>Stage</th>
										<th>Part</th>
										<th>Requirement</th>
										<th>Theme</th>
										<th class="needed">Still needed</th>
									</tr>
								</thead>
								<tbody>
									{#each sortByStreamAndStage(group.gaps.slice(0, MOST_COMMON_LIMIT)) as gap (gapKey(gap))}
										{@const expanded = expandedGaps.includes(gapKey(gap))}
										<tr
											class="gap-row"
											class:expanded
											onclick={() => (expandedGaps = toggle(expandedGaps, gapKey(gap)))}
											title={expanded ? 'Click to collapse' : "Click for details and who's missing"}
										>
											<td class="nowrap" data-label="Stage">{gap.streamDisplay} {gap.stage}</td>
											<td data-label="Part">{gap.inputGroup}</td>
											<td class="stack-title">
												{gap.inputLabel}
												{#if expanded && gap.inputDetail.trim()}
													<div class="statement-detail"><em>{gap.inputDetail.trim()}</em></div>
												{/if}
											</td>
											<td data-label="Theme"><span class="badge badge-info">{gap.theme}</span></td>
											<td class="missing-youth">
												<div class="count-line">
													<span class="count-label">Working on it</span>
													<div class="mini-track">
														<div
															class="mini-fill active"
															style:width="{percent(activeOutstandingPercent(gap))}%"
														></div>
													</div>
													<small
														>{gap.activeCandidateCount === 0
															? 'none started'
															: `${activeOutstandingCount(gap)} of ${gap.activeCandidateCount}`}</small
													>
												</div>
												<div class="count-line">
													<span class="count-label">All eligible</span>
													<div class="mini-track">
														<div
															class="mini-fill"
															style:width="{percent(outstandingPercent(gap))}%"
														></div>
													</div>
													<small title="{gap.completedCount} already completed this stage"
														>{outstandingCount(gap)} of {gap.candidateCount}{gap.priorityMemberCount >
														0
															? `, ${gap.priorityMemberCount} priority`
															: ''}
														{expanded ? '▴' : '▾'}</small
													>
												</div>
												{#if expanded}
													<ul class="plain small who">
														{#each sortBy(gap.outstandingMemberIds, desc(isMovingUp), asc(memberName)) as memberId (memberId)}
															<li>
																{memberName(memberId)}
																{#if isMovingUp(memberId)}
																	<span class="badge">{priorityBadge(memberId)}</span>
																{/if}
															</li>
														{/each}
													</ul>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{/each}
			{/if}
		{/if}

		{#if tab === 'moving-up'}
			{#if report.moveUpCandidates.length === 0}
				<p class="muted">
					No youth reach the move up age of {report.rules.moveUpAgeYears} in the next {settings.moveUpWindowMonths}
					months. Pick focus youth above to track others here.
				</p>
			{:else}
				<h3>{report.rules.peakAwardName}: high priority tasks</h3>
				<p class="muted">
					Outstanding items for youth moving up within {settings.moveUpWindowMonths} months and focus
					youth, most urgent first.
				</p>
				<div class="task-grid section-gap">
					{#each report.priorityTaskBoard as task (task.key)}
						<div class="task-card" class:urgent={task.highUrgencyCount > 0}>
							<div class="task-title">
								<strong>{task.title}</strong>
								<span class="badge badge-dark">{task.memberNames.length}</span>
							</div>
							<div class="small muted">
								{categoryDisplay(task.category)}
								{#if task.highUrgencyCount > 0}
									<span class="text-danger"> · {task.highUrgencyCount} within 3 months</span>
								{/if}
							</div>
							<div class="small">{task.memberNames.join(', ')}</div>
						</div>
					{/each}
				</div>

				<h3>Priority youth</h3>
				<div class="candidate-grid section-gap">
					{#each report.moveUpCandidates as candidate (candidate.memberId)}
						<div class="card candidate-card">
							<div class="candidate-head">
								<div>
									<h4>
										{candidate.memberName}
										{#if candidate.isFocus}<span class="badge badge-info">focus</span>{/if}
									</h4>
									<small class="muted"
										>{candidate.patrol}{candidate.ageDisplay
											? ` · ${candidate.ageDisplay}`
											: ''}{candidate.moveUpDate
											? ` · moves up ${monthYear(candidate.moveUpDate)}`
											: ''}</small
									>
								</div>
								{#if candidate.isMovingUp || candidate.monthsRemaining === null}
									<span class={urgencyClass(candidate.urgency)}
										>{monthsDisplay(candidate.monthsRemaining)}</span
									>
								{/if}
							</div>
							<div class="bar candidate-bar">
								<div style:width="{percent(completionPercent(candidate))}%"></div>
							</div>
							<small class="muted"
								>{percent(completionPercent(candidate))}% towards the {report.rules.peakAwardName}, {candidateOutstandingCount(
									candidate
								)} items outstanding</small
							>
							<div class="small muted">
								{candidate.peakAwardBreakdown
									.map((c) => `${c.name} ${formatOneDecimal(c.earned)}/${formatOneDecimal(c.max)}`)
									.join(' · ')}
							</div>
							<ul class="plain task-list">
								{#each sortBy( candidate.tasks, asc((t) => t.done) ) as task (task.key)}
									<li class={task.done ? 'done' : 'todo'}>
										<Icon name={task.done ? 'check' : 'x'} />
										{task.title}
										{#if !task.done && task.detail}<small class="muted">
												- {task.detail}</small
											>{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		{#if tab === 'programme'}
			<h3>Skill themes across outstanding requirements</h3>
			<div class="table-scroll section-gap">
				<table class="table stack-table">
					<thead>
						<tr>
							<th>Theme</th>
							<th class="num">Working on it</th>
							<th class="num">All eligible still needing</th>
							<th class="num">Priority</th>
							<th class="num">Requirements</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each report.skillThemes as theme (theme.name)}
							{@const expanded = expandedThemes.includes(theme.name)}
							<tr>
								<td class="stack-title"
									><strong>{theme.name}</strong><br /><small class="muted"
										>{theme.description}</small
									></td
								>
								<td class="num" data-label="Working on it">{theme.activeMemberIds.length}</td>
								<td class="num" data-label="All eligible still needing">{theme.memberIds.length}</td
								>
								<td class="num" data-label="Priority">{theme.priorityMemberCount}</td>
								<td class="num" data-label="Requirements">{theme.outstandingRequirements}</td>
								<td class="num"
									><button
										type="button"
										class="btn btn-sm btn-outline-secondary"
										onclick={() => (expandedThemes = toggle(expandedThemes, theme.name))}
										>{expanded ? 'Hide' : 'Show'}</button
									></td
								>
							</tr>
							{#if expanded}
								<tr>
									<td colspan="6">
										<ul class="small">
											{#each theme.requirements as requirement (gapKey(requirement))}
												<li>
													{requirement.streamDisplay}
													{requirement.stage} ({requirement.inputGroup}): {requirement.inputLabel}
													<span class="muted"
														>- {activeOutstandingCount(requirement)} working on it, {outstandingCount(
															requirement
														)} eligible</span
													>
												</li>
											{/each}
										</ul>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			<h3>Milestone challenge area balance</h3>
			<p class="muted">
				Participates still needed for each youth's current milestone{topArea &&
				topArea.participatesShort > 0
					? `. Programme more ${topArea.challengeArea} activities.`
					: '.'}
			</p>
			<div class="section-gap">
				{#each report.challengeAreaDeficits as deficit (deficit.challengeArea)}
					<div class="bar-row">
						<div class="bar-label">{deficit.challengeArea}</div>
						<div class="bar-track">
							<div
								class="bar-fill"
								style:width="{Math.round((100 * deficit.participatesShort) / maxDeficit)}%"
							></div>
						</div>
						<div class="bar-value">
							{deficit.participatesShort} short across {deficit.youthShort} youth
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Title on the left, icon buttons on the right */
	.insights-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.insights-header h2 {
		margin: 0;
	}

	.toolbar {
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
	}

	/* How many filters differ from the defaults */
	.filter-count {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 1.15rem;
		height: 1.15rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: #e8a33d;
		color: #fff;
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1.15rem;
	}

	.filters-panel {
		margin-bottom: 1rem;
		padding: 0.25rem 0.9rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.filters-section {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--border-soft);
	}

	.filters-section summary {
		padding: 0.2rem 0 0.5rem;
		cursor: pointer;
	}

	.section-title {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	/* The whole row is the tap target */
	.filter-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 40px;
		cursor: pointer;
	}

	.filter-row input {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
	}

	.focus-list {
		max-height: 14rem;
		overflow-y: auto;
	}

	.advanced {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.advanced label {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.25rem;
	}

	.filters-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.75rem;
	}

	.filters-actions .btn {
		min-width: 6rem;
		min-height: 44px;
	}

	.loading-note {
		max-width: 28rem;
		margin-bottom: 1rem;
		color: var(--text-2);
	}

	.bar.thin {
		height: 6px;
		margin-top: 0.25rem;
	}

	.bar.thin > div {
		background: var(--primary);
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat-tile {
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--surface);
	}

	.stat-label {
		color: var(--muted);
		font-size: 0.8rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.stat-note {
		color: var(--muted);
		font-size: 0.85rem;
	}

	.tabs .badge {
		margin-left: 0.2rem;
	}

	@media (max-width: 575.98px) {
		.wide-only {
			display: none;
		}

		.tabs button {
			padding: 0.5rem 0.25rem;
			font-size: 0.875rem;
		}
	}

	h3 {
		margin-top: 0.5rem;
	}

	.section-gap {
		margin-bottom: 1.5rem;
	}

	.plain {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.center {
		text-align: center !important;
	}

	.nowrap {
		white-space: nowrap;
	}

	.badge-muted {
		background: var(--faint);
	}

	.badge-dark {
		background: var(--text);
		color: var(--bg);
	}

	.badge-light {
		margin-left: 0.25rem;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		font-weight: 500;
	}

	.heatmap td,
	.heatmap th {
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.heatmap tbody tr:nth-child(odd) {
		background: none;
	}

	.heatmap td.heat-0 {
		background: var(--surface-2);
		color: var(--faint);
	}

	.heatmap td.heat-1 {
		background: #d6eef0;
	}

	.heatmap td.heat-2 {
		background: #9fd6db;
	}

	.heatmap td.heat-3 {
		background: #4fb3bd;
		color: #fff;
	}

	.heatmap td.heat-4 {
		background: #1b7f8a;
		color: #fff;
	}

	/* The whole cell opens the stage, keeping the heatmap's colours */
	.stage-link {
		display: block;
		margin: -0.4rem -0.5rem;
		padding: 0.4rem 0.5rem;
		color: inherit;
		text-decoration: none;
	}

	.stage-link:hover {
		text-decoration: underline;
	}

	.stream-toggle {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.stage-youth-row td {
		min-width: 90px;
		background: var(--surface);
		font-size: 0.75rem;
		white-space: normal;
	}

	.gap-title {
		margin: 1rem 0 0.25rem;
	}

	.gap-row {
		cursor: pointer;
	}

	.gap-row.expanded td {
		background: var(--surface-2);
	}

	.needed {
		min-width: 290px;
	}

	.statement-detail {
		margin-top: 0.35rem;
		color: var(--text-2);
		font-size: 0.85rem;
		white-space: pre-line;
	}

	.missing-youth small {
		white-space: nowrap;
	}

	.who {
		margin-top: 0.25rem;
	}

	.count-line {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.count-label {
		flex: 0 0 85px;
		color: var(--muted);
		font-size: 0.75rem;
	}

	.mini-track {
		flex: 0 0 60px;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.mini-fill {
		height: 100%;
		background: #d9534f;
	}

	.mini-fill.active {
		background: #0d6efd;
	}

	.task-grid,
	.candidate-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
		gap: 0.75rem;
	}

	.candidate-grid {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
	}

	.task-card {
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-left: 4px solid #6c757d;
		border-radius: 0.4rem;
	}

	.task-card.urgent {
		border-left-color: #d9534f;
	}

	.task-title,
	.candidate-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.candidate-card + .candidate-card {
		margin-top: 0;
	}

	.candidate-head h4 {
		margin: 0;
	}

	.candidate-bar {
		margin: 0.5rem 0;
	}

	.task-list {
		margin-top: 0.5rem;
	}

	.task-list li {
		padding: 0.1rem 0;
	}

	.task-list li.done {
		color: var(--muted);
	}

	.task-list li.done :global(.icon) {
		color: var(--success);
	}

	.task-list li.todo :global(.icon) {
		color: #d9534f;
	}

	.bar-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.bar-label {
		flex: 0 0 140px;
		font-size: 0.9rem;
	}

	.bar-track {
		flex: 1 1 auto;
		height: 18px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: 4px;
		background: #7b61b5;
	}

	.bar-value {
		flex: 0 0 220px;
		color: var(--text-2);
		font-size: 0.85rem;
	}

	@media (max-width: 640px) {
		.bar-label {
			flex-basis: 100px;
		}

		.bar-value {
			flex-basis: 110px;
		}
	}

	@media (max-width: 575.98px) {
		/* Keep the stream names in view while the stage columns scroll */
		.heatmap tr > :first-child {
			position: sticky;
			left: 0;
			z-index: 1;
			background: var(--surface);
			box-shadow: 1px 0 0 var(--border);
		}

		.count-line .mini-track {
			flex-basis: 80px;
		}

		.needed {
			min-width: 0;
		}
	}

	@media screen and (prefers-color-scheme: dark) {
		.heatmap td.heat-1 {
			background: #1d4448;
		}

		.heatmap td.heat-2 {
			background: #2a6a70;
			color: #fff;
		}
	}
</style>
