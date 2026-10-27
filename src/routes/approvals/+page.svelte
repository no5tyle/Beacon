<!--
	Approvals: the unit's submissions waiting for the Unit Council, as Terrain's Approvals tab lists them,
	with an Approve button on reviews and an Award button on awards Terrain lets the leader action, and a
	history of those it has finished with.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MultiSelect from '#lib/components/MultiSelect.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import {
		approvalSubtitle,
		approvalTitle,
		canApproveInBeacon,
		canAwardInBeacon,
		decidedWithin,
		hasVoted,
		isAwardDate,
		localDate,
		mayMoveToReview,
		outcomeDisplay,
		RECENT_DAYS,
		isDecidingVote,
		submittedDisplay,
		VOTES_NEEDED,
		withActioned,
		type Actioned,
		type DecidedSubmission,
		type PendingApproval
	} from '#lib/model/approvals.js';
	import { asc, distinct, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, approvals, approvalsBadge } from '#lib/services/index.js';
	import type { ApprovalsUnit } from '#lib/services/approvals.js';
	import { unitsKey } from '#lib/stores/approvals.svelte.js';

	let pending = $state<PendingApproval[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	// How the cards are grouped: by youth, or by achievement
	let groupByMember = $state(true);
	let confirming = $state('');
	// Awards ticked to hand out together, and the day they're recorded against, today unless the leader
	// picks an earlier one
	const ticked = new SvelteSet<string>();
	let awardDate = $state(localDate());
	// The unit whose ticked awards are being confirmed
	let confirmingAwards = $state('');
	// Whether approving a special interest area plan through also moves it on to the review for the youth
	let moveToReview = $state(true);
	let working = $state('');
	let message = $state<{ text: string; isError: boolean } | null>(null);
	let tab = $state<'waiting' | 'history'>('waiting');
	// The units Terrain listed approvals for (those whose Unit Council the leader is on), and those it
	// couldn't be reached for
	let loadedUnits = $state<ApprovalsUnit[]>([]);
	let failedUnits = $state<ApprovalsUnit[]>([]);
	// The history loads the first time its tab is opened, for the units it was loaded for
	let history = $state<DecidedSubmission[]>([]);
	let historyFor = $state('');
	let historyLoading = $state(false);
	let historyError = $state('');
	let showOlder = $state(false);

	// What the leader has just done, shown straight away and kept until Terrain's list shows it too
	let actioned = new SvelteMap<string, Actioned>();
	// Checking Terrain again a few times, a little longer apart each time, while it catches up
	const CHECK_AGAIN_MS = [1500, 3000, 6000];
	let checksAgain = 0;
	let checkTimer: ReturnType<typeof setTimeout> | undefined;
	// A load asked for while one was running, e.g. straight after an approval, runs once it's finished
	let loadAgain = false;

	// Every unit the leader has in the chosen group, listed together
	const units = $derived(app.units);
	const unitsId = $derived(unitsKey(units));
	const me = $derived(approvals.leaderMemberId());

	async function load() {
		const id = unitsId;
		if (!id) return;
		if (loading) {
			loadAgain = true;
			return;
		}
		loading = true;
		errorMessage = '';
		try {
			const found = await approvals.pendingIn(units);
			if (id !== unitsId) return;
			loadedUnits = found.loaded;
			failedUnits = found.failed;
			const shown = withActioned(found.list, actioned, approvals.leader());
			// Forget what Terrain now shows; keep checking for the rest
			actioned = new SvelteMap([...actioned].filter(([key]) => shown.lagging.includes(key)));
			showList(id, shown.list);
			clearTimeout(checkTimer);
			if (shown.lagging.length > 0 && checksAgain < CHECK_AGAIN_MS.length)
				checkTimer = setTimeout(load, CHECK_AGAIN_MS[checksAgain++]);
		} catch {
			errorMessage = "Couldn't load approvals from Terrain. Try again in a moment.";
		} finally {
			loading = false;
			if (loadAgain) {
				loadAgain = false;
				load();
			}
		}
	}

	function showList(id: string, list: PendingApproval[]) {
		pending = list;
		// Keeps the badge on More and Approvals in step, e.g. once the leader has voted
		approvalsBadge.update(id, list);
	}

	/** Shows what the leader did straight away, then reloads the list from Terrain */
	async function recordAction(list: PendingApproval[], action: Actioned['action']) {
		for (const approval of list)
			actioned.set(approval.submissionId, { action, wasAward: approval.isAward });
		showList(unitsId, withActioned(pending, actioned, approvals.leader()).list);
		// Something that went through belongs in the history now: read it again when it's next shown,
		// marked before the reload so opening History straight away doesn't show it as it was
		if (historyFor) historyFor = '';
		checksAgain = 0;
		await load();
	}

	async function loadHistory() {
		const id = unitsId;
		if (!id || historyLoading) return;
		historyLoading = true;
		historyError = '';
		try {
			const found = await approvals.historyIn(units);
			if (id !== unitsId) return;
			history = found.list;
			historyFor = id;
		} catch {
			historyError = "Couldn't load the history from Terrain. Try again in a moment.";
		} finally {
			historyLoading = false;
		}
	}

	// Refresh and pull to refresh reload whichever tab is showing
	const refresh = () => (tab === 'history' ? loadHistory() : load());

	function showTab(next: 'waiting' | 'history') {
		tab = next;
		if (next === 'history' && historyFor !== unitsId) loadHistory();
	}

	// No more checking once the page closes
	$effect(() => () => clearTimeout(checkTimer));

	$effect(() => {
		// Approvals are for leaders on the Unit Council; a youth goes back to Home
		if (app.isYouth) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		void unitsId;
		actioned = new SvelteMap();
		ticked.clear();
		confirmingAwards = '';
		loadedUnits = [];
		failedUnits = [];
		clearTimeout(checkTimer);
		pending = [];
		history = [];
		historyFor = '';
		showOlder = false;
		historyYouth = [];
		message = null;
		confirming = '';
		if (untrack(() => tab) === 'history') untrack(loadHistory);
		// Only the unit reloads the list; what load() reads, such as whether it is loading, mustn't
		untrack(load);
	});

	const grouped = (list: PendingApproval[]) =>
		groupBy(
			sortBy(
				list,
				asc((a) => (groupByMember ? a.memberName : a.achievementName)),
				asc((a) => Date.parse(a.submittedOn) || 0)
			),
			(a) => (groupByMember ? a.memberName : a.achievementName)
		);
	// e.g. "4 to approve · 1 to award"
	const counts = (list: PendingApproval[]) => {
		const awards = list.filter((a) => a.isAward).length;
		return [
			list.length > awards ? `${list.length - awards} to approve` : '',
			awards > 0 ? `${awards} to award` : ''
		]
			.filter(Boolean)
			.join(' · ');
	};
	// Each unit with something waiting, in the order of the leader's units: its reviews waiting for Unit
	// Council votes, and those approved and waiting to be handed out
	const unitViews = $derived(
		loadedUnits
			.map((unit) => {
				const items = pending.filter((a) => a.unitId === unit.id);
				const toAward = items.filter((a) => a.isAward);
				const awardGroups = grouped(toAward);
				// The awards this leader can tick
				const awardable = awardGroups.flatMap((g) => g.items).filter(canAwardInBeacon);
				return {
					unit,
					items,
					toApprove: items.filter((a) => !a.isAward),
					toAward,
					reviewGroups: grouped(items.filter((a) => !a.isAward)),
					awardGroups,
					awardable,
					tickedAwards: awardable.filter((a) => ticked.has(a.submissionId))
				};
			})
			.filter((view) => view.items.length > 0)
	);
	type UnitView = (typeof unitViews)[number];
	// Units get a heading of their own once the leader has more than one listed
	const severalUnits = $derived(loadedUnits.length > 1);
	const countText = $derived(counts(pending));
	// The unit, or the group when several units are listed together
	const summaryName = $derived(
		loadedUnits.length === 1
			? loadedUnits[0].name
			: loadedUnits.length > 1
				? app.groupName
				: app.unitName
	);
	const historyUnits = $derived(distinct(history.map((h) => h.unitId)).length > 1);
	const names = (voters: { name: string }[]) => voters.map((v) => v.name).join(', ');

	const recentHistory = $derived(history.filter((h) => decidedWithin(h, RECENT_DAYS)));
	// Youth to show in the history; none picked means everyone
	let historyYouth = $state<string[]>([]);
	const historyNames = $derived(
		sortBy(
			distinct(history.map((h) => h.memberName)),
			asc((n) => n)
		)
	);
	const shownHistory = $derived(
		(showOlder ? history : recentHistory).filter(
			(h) => historyYouth.length === 0 || historyYouth.includes(h.memberName)
		)
	);

	async function approve(approval: PendingApproval) {
		if (working) return;
		working = approval.submissionId;
		message = null;
		const result = await approvals.approve(approval);
		// Only once the approval is in: a plan Terrain hasn't approved can't move on
		const moved =
			result.success && moveToReview && mayMoveToReview(approval)
				? await approvals.moveToReview(approval)
				: null;
		working = '';
		confirming = '';
		if (result.success) {
			const votes = approval.approvedBy.length + 1;
			const approved = `Approved ${approvalTitle(approval)} for ${approval.memberName}.`;
			message =
				moved && !moved.success
					? {
							text: `${approved} It couldn't be moved on to the review${moved.status > 0 ? ` (response ${moved.status})` : ''}: ${approval.memberName} can move it on in Terrain.`,
							isError: true
						}
					: {
							text:
								votes >= VOTES_NEEDED
									? moved?.moved
										? `${approved} Moved it on to the review.`
										: approved
									: `${approved} It needs ${VOTES_NEEDED - votes} more Unit Council ${VOTES_NEEDED - votes === 1 ? 'member' : 'members'} to approve.`,
							isError: false
						};
		} else {
			message = {
				text:
					result.status > 0
						? `Terrain didn't accept the approval (response ${result.status}). Check it in Terrain before trying again.`
						: result.body || "Couldn't approve. Check it in Terrain before trying again.",
				isError: true
			};
		}
		if (result.success) await recordAction([approval], isDecidingVote(approval) ? 'done' : 'voted');
		else await load();
	}

	function confirmApprove(approval: PendingApproval) {
		moveToReview = true;
		confirming = approval.submissionId;
	}

	function toggleAllAwards(view: UnitView) {
		const all = view.tickedAwards.length === view.awardable.length;
		for (const a of view.awardable) {
			if (all) ticked.delete(a.submissionId);
			else ticked.add(a.submissionId);
		}
	}

	function confirmAwards(view: UnitView) {
		awardDate = localDate();
		confirming = '';
		confirmingAwards = view.unit.id;
	}

	async function awardTicked(view: UnitView) {
		const list = view.tickedAwards;
		if (working || list.length === 0) return;
		working = 'awards';
		message = null;
		const results = await approvals.awardMany(list, awardDate);
		working = '';
		confirmingAwards = '';
		const done = results.filter((r) => r.result.success);
		const failed = results.filter((r) => !r.result.success);
		const named = (r: (typeof results)[number]) =>
			`${approvalTitle(r.approval)} for ${r.approval.memberName}`;
		message = {
			text: [
				done.length === 1
					? `Awarded ${approvalTitle(done[0].approval)} to ${done[0].approval.memberName}.`
					: done.length > 1
						? `Awarded ${done.length}.`
						: '',
				failed.length > 0
					? `Terrain didn't accept ${failed.map(named).join(', ')}${failed[0].result.status > 0 ? ` (response ${failed[0].result.status})` : ''}. Check ${failed.length === 1 ? 'it' : 'them'} in Terrain before trying again.`
					: ''
			]
				.filter(Boolean)
				.join(' '),
			isError: failed.length > 0
		};
		for (const r of done) ticked.delete(r.approval.submissionId);
		if (done.length > 0)
			await recordAction(
				done.map((r) => r.approval),
				'done'
			);
		else await load();
	}
</script>

<svelte:head>
	<title>Beacon / Approvals</title>
</svelte:head>

{#snippet approvalCard(approval: PendingApproval)}
	{@const voted = hasVoted(approval, me)}
	{@const subtitle = groupByMember
		? approvalSubtitle(approval)
		: [approval.projectName, approval.siaStage].filter(Boolean).join(' · ')}
	<div class="approval-card">
		<div class="strong">
			{groupByMember ? approvalTitle(approval) : approval.memberName}
		</div>
		{#if subtitle}<div class="small subtitle">{subtitle}</div>{/if}
		<div class="small muted">
			{approval.submissionType} · submitted {submittedDisplay(approval.submittedOn)}
		</div>
		<div class="small votes">
			{#if !approval.isAward}
				<span class={approval.approvedBy.length > 0 ? 'text-success' : 'muted'}>
					<Icon name="check" />
					{approval.approvedBy.length} of {VOTES_NEEDED} approved{approval.approvedBy.length > 0
						? ` (${names(approval.approvedBy)})`
						: ''}
				</span>
			{/if}
			{#if approval.improveBy.length > 0}
				<span class="text-danger">
					<Icon name="action-undo" />
					Needs improvement: {names(approval.improveBy)}
				</span>
			{/if}
		</div>

		{#if canAwardInBeacon(approval)}
			<label class="small award-pick"
				><input
					type="checkbox"
					class="form-check-input"
					disabled={working !== ''}
					checked={ticked.has(approval.submissionId)}
					onchange={(e) =>
						e.currentTarget.checked
							? ticked.add(approval.submissionId)
							: ticked.delete(approval.submissionId)}
				/>
				Award {approvalTitle(approval)} to {approval.memberName}</label
			>
		{:else if approval.isAward}
			<div class="small muted award-note">Terrain doesn't let you award this one.</div>
		{:else if canApproveInBeacon(approval) && !voted}
			{#if confirming === approval.submissionId}
				<div class="confirm-box">
					<strong>Approve {approvalTitle(approval)} for {approval.memberName}?</strong>
					<p class="small">
						Terrain records your approval as a Unit Council member. It goes through once {VOTES_NEEDED}
						members have approved; this would be approval {approval.approvedBy.length + 1} of
						{VOTES_NEEDED}.
					</p>
					{#if mayMoveToReview(approval)}
						<label class="small move-to-review"
							><input type="checkbox" class="form-check-input" bind:checked={moveToReview} />
							If it's the plan, move it on to the review for {approval.memberName}</label
						>
					{/if}
					<button
						type="button"
						class="btn btn-sm btn-success"
						disabled={working !== ''}
						onclick={() => approve(approval)}
						>{working === approval.submissionId ? 'Approving...' : 'Yes, approve'}</button
					>
					<button
						type="button"
						class="btn btn-sm btn-outline-secondary"
						disabled={working !== ''}
						onclick={() => (confirming = '')}>Cancel</button
					>
				</div>
			{:else}
				<div class="actions">
					<button
						type="button"
						class="btn btn-sm btn-outline-primary"
						disabled={working !== ''}
						onclick={() => confirmApprove(approval)}><Icon name="check" /> Approve</button
					>
				</div>
			{/if}
		{:else if voted}
			<div class="small muted voted">You've voted on this one.</div>
		{/if}
	</div>
{/snippet}

{#snippet approvalGroups(groups: { key: string; items: PendingApproval[] }[])}
	{#each groups as group (group.key)}
		<section class="approval-group" aria-label={group.key}>
			<div class="group-heading">
				{group.key} <span class="muted">({group.items.length})</span>
			</div>
			{#each group.items as approval (approval.submissionId)}
				{@render approvalCard(approval)}
			{/each}
		</section>
	{/each}
{/snippet}

{#snippet unitSections(view: UnitView)}
	{#if view.reviewGroups.length > 0}
		<section class="approval-section" aria-label="To approve">
			<h3>To approve <span class="muted">({view.toApprove.length})</span></h3>
			{@render approvalGroups(view.reviewGroups)}
		</section>
	{/if}
	{#if view.awardGroups.length > 0}
		<section class="approval-section" aria-label="Ready to award">
			<h3>Ready to award <span class="muted">({view.toAward.length})</span></h3>
			<p class="small muted">
				Approved by the Unit Council. Tick the ones handed out to award them together.
			</p>
			{#if view.awardable.length > 0}
				<div class="award-bar">
					<button
						type="button"
						class="btn btn-sm btn-outline-secondary"
						disabled={working !== ''}
						onclick={() => toggleAllAwards(view)}
						>{view.tickedAwards.length === view.awardable.length
							? 'Untick all'
							: 'Tick all'}</button
					>
					<button
						type="button"
						class="btn btn-sm btn-primary"
						disabled={working !== '' || view.tickedAwards.length === 0}
						onclick={() => confirmAwards(view)}
						><Icon name="check" /> Award {view.tickedAwards.length > 0
							? view.tickedAwards.length
							: ''}</button
					>
				</div>
				{#if confirmingAwards === view.unit.id && view.tickedAwards.length > 0}
					<div class="confirm-box">
						<strong
							>Award {view.tickedAwards.length === 1
								? `${approvalTitle(view.tickedAwards[0])} to ${view.tickedAwards[0].memberName}`
								: `these ${view.tickedAwards.length}`}?</strong
						>
						{#if view.tickedAwards.length > 1}
							<ul class="small award-list">
								{#each view.tickedAwards as a (a.submissionId)}
									<li>{approvalTitle(a)}, {a.memberName}</li>
								{/each}
							</ul>
						{/if}
						<p class="small">
							Terrain records {view.tickedAwards.length === 1 ? 'it' : 'each'} as awarded by you on the
							day you choose, and {view.tickedAwards.length === 1 ? 'it leaves' : 'they leave'} this list.
						</p>
						<div class="field award-date">
							<label class="form-label small" for="awardDate-{view.unit.id}">Date awarded</label>
							<input
								id="awardDate-{view.unit.id}"
								type="date"
								class="form-control form-control-sm"
								max={localDate()}
								bind:value={awardDate}
							/>
						</div>
						<button
							type="button"
							class="btn btn-sm btn-success"
							disabled={working !== '' || !isAwardDate(awardDate)}
							onclick={() => awardTicked(view)}
							>{working === 'awards' ? 'Awarding...' : 'Yes, award'}</button
						>
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary"
							disabled={working !== ''}
							onclick={() => (confirmingAwards = '')}>Cancel</button
						>
					</div>
				{/if}
			{/if}
			{@render approvalGroups(view.awardGroups)}
		</section>
	{/if}
{/snippet}

{#snippet historyTab()}
	{#if historyLoading && history.length === 0}
		<p class="muted">Loading the history from Terrain...</p>
	{:else if historyError}
		<div class="alert alert-danger">{historyError}</div>
	{:else if history.length === 0}
		<div class="approvals-empty">Nothing has been through the Unit Council yet.</div>
	{:else}
		{#if historyNames.length > 1}
			<div class="history-filter">
				<MultiSelect
					id="historyYouth"
					label="Youth"
					options={historyNames}
					bind:selected={historyYouth}
					noun="youth"
				/>
			</div>
		{/if}
		<p class="small muted">
			{showOlder
				? `All ${history.length} the Unit Council has finished with, most recent first.`
				: `Finished with in the last ${RECENT_DAYS} days, most recent first.`}
		</p>
		{#if shownHistory.length === 0}
			<p class="muted">
				Nothing{historyYouth.length > 0 ? ' for the youth picked' : ''}{showOlder
					? ''
					: ` in the last ${RECENT_DAYS} days`}.
			</p>
		{/if}
		{#each shownHistory as item (item.submissionId)}
			<div class="approval-card history-card">
				<div class="history-title">
					<span class="strong">{item.memberName}</span>
					<span class="badge {item.outcome === 'approved' ? 'badge-success' : 'badge-muted'}"
						>{outcomeDisplay(item.outcome)}</span
					>
				</div>
				<div>{item.achievementName}</div>
				<div class="small muted">
					{historyUnits ? `${item.unitName} · ` : ''}{item.submissionType} · decided {submittedDisplay(
						item.decidedOn
					)} · submitted {submittedDisplay(item.submittedOn)}
				</div>
				{#if item.approvedBy.length > 0 || item.improveBy.length > 0}
					<div class="small votes">
						{#if item.approvedBy.length > 0}
							<span class="text-success"
								><Icon name="check" /> Approved by {names(item.approvedBy)}</span
							>
						{/if}
						{#if item.improveBy.length > 0}
							<span class="text-danger"
								><Icon name="action-undo" /> Improvement asked by {names(item.improveBy)}</span
							>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if !showOlder && history.length > recentHistory.length}
			<button type="button" class="btn btn-outline-secondary" onclick={() => (showOlder = true)}
				>Show older ({history.length - recentHistory.length})</button
			>
		{/if}
	{/if}
{/snippet}

<div use:pullToRefresh={refresh}>
	<div class="approvals-header">
		<h2>Approvals</h2>
		<button
			type="button"
			class="btn icon-btn btn-outline-secondary"
			onclick={refresh}
			disabled={(tab === 'history' ? historyLoading : loading) || !unitsId}
			title="Check Terrain again"
			aria-label="Refresh"
		>
			<Icon name="reload" />
		</button>
	</div>

	{#if !unitsId}
		<ChooseUnit />
	{:else}
		<p class="small muted summary">
			{summaryName}{loading || !countText ? '' : ` · ${countText}`}
		</p>

		<div class="tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'waiting'}
				onclick={() => showTab('waiting')}
				>Waiting{#if pending.length > 0}
					&nbsp;<span class="badge">{pending.length}</span>{/if}</button
			>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'history'}
				onclick={() => showTab('history')}>History</button
			>
		</div>

		{#if message}
			<div class="alert {message.isError ? 'alert-danger' : 'alert-success'}" role="status">
				{message.text}
			</div>
		{/if}

		{#if failedUnits.length > 0 && !loading}
			<div class="alert alert-warning">
				Couldn't load {failedUnits.map((u) => u.name).join(', ')} from Terrain. Refresh to try again.
			</div>
		{/if}

		{#if tab === 'history'}
			{@render historyTab()}
		{:else if loading && pending.length === 0}
			<p class="muted">Loading approvals from Terrain...</p>
		{:else if errorMessage}
			<div class="alert alert-danger">{errorMessage}</div>
		{:else if pending.length === 0}
			<div class="approvals-empty">
				<Icon name="circle-check" />
				{loadedUnits.length === 0 && failedUnits.length === 0
					? "Terrain doesn't list approvals for you in any of your units: they're for Unit Council members."
					: 'Nothing is waiting for approval.'}
			</div>
		{:else}
			{#if pending.length > 1}
				<div class="filters">
					<div class="field group-by">
						<label class="form-label small" for="groupBy">Group by</label>
						<select
							id="groupBy"
							class="form-select"
							value={groupByMember ? 'member' : 'achievement'}
							onchange={(e) => (groupByMember = e.currentTarget.value === 'member')}
						>
							<option value="member">Youth</option>
							<option value="achievement">Achievement</option>
						</select>
					</div>
				</div>
			{/if}

			{#each unitViews as view (view.unit.id)}
				{#if severalUnits}
					<section class="unit-section" aria-label={view.unit.name}>
						<h3 class="unit-heading">
							{view.unit.name} <span class="muted small">· {counts(view.items)}</span>
						</h3>
						{@render unitSections(view)}
					</section>
				{:else}
					{@render unitSections(view)}
				{/if}
			{/each}
		{/if}
	{/if}
</div>

<style>
	.approvals-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.approvals-header h2 {
		margin: 0;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border-radius: 50%;
	}

	.unit-section + .unit-section {
		margin-top: 2rem;
	}

	.unit-heading {
		margin-bottom: 0.5rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--border);
	}

	.summary {
		margin-bottom: 0.75rem;
	}

	.history-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.badge-muted {
		background: var(--faint);
	}

	.filters {
		margin-bottom: 1rem;
	}

	.history-filter {
		margin-bottom: 0.75rem;
	}

	.group-by {
		max-width: 14rem;
		margin-bottom: 0;
	}

	.group-heading {
		margin: 1rem 0 0.4rem;
		font-weight: 600;
	}

	.approval-card {
		margin-bottom: 0.5rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.votes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.75rem;
		margin-top: 0.15rem;
	}

	.subtitle {
		color: var(--text);
	}

	.actions,
	.voted,
	.award-note {
		margin-top: 0.5rem;
	}

	.confirm-box {
		margin-top: 0.6rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid #ffc107;
		border-radius: 0.4rem;
		background: #fffbea;
	}

	.confirm-box p {
		margin: 0.3rem 0 0.5rem;
	}

	.approval-section + .approval-section {
		margin-top: 1.5rem;
	}

	.approval-section h3 {
		margin-bottom: 0.25rem;
	}

	.award-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.award-list {
		margin: 0.3rem 0 0;
		padding-left: 1.2rem;
	}

	.award-pick,
	.move-to-review {
		display: flex;
		gap: 0.4rem;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.award-pick {
		margin: 0.5rem 0 0;
	}

	.award-date {
		max-width: 12rem;
		margin-bottom: 0.5rem;
	}

	.approvals-empty {
		padding: 1.5rem 1rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
		color: var(--muted);
		text-align: center;
	}

	.approvals-empty :global(.icon) {
		display: block;
		margin: 0 auto 0.4rem;
		color: var(--success);
		font-size: 1.5rem;
	}

	@media screen and (prefers-color-scheme: dark) {
		.confirm-box {
			border-color: #8a6d1c;
			background: #332a12;
		}
	}
</style>
