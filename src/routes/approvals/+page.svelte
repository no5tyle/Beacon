<!--
	Approvals: the chosen unit's submissions in three tabs. Approve lists reviews waiting for the Unit
	Council's votes, Award those approved to hand out, and Submit the milestones and OAS stages done but
	not yet submitted. A filter picks youth and the grouping, and leads to the history page.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import YouthLoadProgress from '#lib/components/YouthLoadProgress.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MultiSelect from '#lib/components/MultiSelect.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import {
		approvalSubtitle,
		approvalTitle,
		canApproveInBeacon,
		canAwardInBeacon,
		hasVoted,
		isAwardDate,
		localDate,
		mayMoveToReview,
		isDecidingVote,
		submittedDisplay,
		VOTES_NEEDED,
		withActioned,
		type Actioned,
		type PendingApproval
	} from '#lib/model/approvals.js';
	import { asc, distinct, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import {
		app,
		approvals,
		approvalsBadge,
		members,
		recording,
		readyToSubmit
	} from '#lib/services/index.js';
	import type { ApprovalsUnit } from '#lib/services/approvals.js';
	import { unitsKey } from '#lib/stores/approvals.svelte.js';
	import { isSubmitted, type ReadyItem } from '#lib/stores/readyToSubmit.svelte.js';

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
	type Tab = 'approve' | 'award' | 'submit';
	let tab = $state<Tab>('approve');
	// Filters: a few youth to show (none picked means everyone), and whether the panel is open
	let showFilters = $state(false);
	let youthFilter = $state<string[]>([]);
	const shownName = (name: string) => youthFilter.length === 0 || youthFilter.includes(name);
	// The units Terrain listed approvals for (those whose Unit Council the leader is on), and those it
	// couldn't be reached for
	let loadedUnits = $state<ApprovalsUnit[]>([]);
	let failedUnits = $state<ApprovalsUnit[]>([]);
	// Milestones and OAS stages done but not submitted, so not in Terrain's list: found in the background
	// (ReadyToSubmit), so the Submit tab and its count are ready when the page opens
	type Ready = ReadyItem;
	const ready = $derived(readyToSubmit.items);
	// Looking for milestones and stages ready to submit, after the youth's progress has loaded
	const readyChecking = $derived(readyToSubmit.checking);
	// Ready milestones ticked to submit together, the unit whose ticked ones are being confirmed, and those
	// submitted here, until Terrain lists them
	const readyKey = (r: Ready) => r.key;
	const tickedReady = new SvelteSet<string>();
	let confirmingSubmit = $state('');
	const submittedHere = new SvelteSet<string>();
	const readyTitle = (r: Ready) => r.title;

	function toggleAllReady(view: UnitView) {
		const all = view.tickedReady.length === view.tickable.length;
		for (const r of view.tickable) {
			if (all) tickedReady.delete(readyKey(r));
			else tickedReady.add(readyKey(r));
		}
	}

	// One youth at a time: submitting switches Terrain to that youth's profile and back
	async function submitTicked(view: UnitView) {
		const list = view.tickedReady;
		if (working || list.length === 0) return;
		working = 'submitting';
		message = null;
		const results: { r: Ready; failure: string }[] = [];
		for (const r of list) {
			const outcome = r.stage
				? await recording.submitStage(r.memberId, r.stage, r.unitId)
				: await recording.submitMilestone(r.memberId, r.milestone!, r.unitId);
			results.push({ r, failure: outcome.state === 'Failed' ? outcome.message : '' });
		}
		working = '';
		confirmingSubmit = '';
		const done = results.filter((x) => !x.failure);
		const failed = results.filter((x) => x.failure);
		for (const { r } of done) {
			tickedReady.delete(readyKey(r));
			submittedHere.add(readyKey(r));
		}
		readyToSubmit.submitted(done.map(({ r }) => readyKey(r)));
		message = {
			text: [
				done.length === 1
					? `Submitted ${readyTitle(done[0].r)} for ${done[0].r.name}.`
					: done.length > 1
						? `Submitted ${done.length}.`
						: '',
				done.length > 0 ? 'They join the list to approve once Terrain shows them.' : '',
				...failed.map((x) => `${readyTitle(x.r)} for ${x.r.name}: ${x.failure}`)
			]
				.filter(Boolean)
				.join(' '),
			isError: failed.length > 0
		};
		if (done.length > 0) load();
	}

	// What the leader has just done, shown straight away and kept until Terrain's list shows it too
	let actioned = new SvelteMap<string, Actioned>();
	// Checking Terrain again a few times, a little longer apart each time, while it catches up
	const CHECK_AGAIN_MS = [1500, 3000, 6000];
	let checksAgain = 0;
	let checkTimer: ReturnType<typeof setTimeout> | undefined;
	// A load asked for while one was running, e.g. straight after an approval, runs once it's finished
	let loadAgain = false;

	// The chosen unit's approvals, like the rest of the app (switching units switches the list)
	const units = $derived(app.chosenUnits);
	const unitsId = $derived(unitsKey(units));
	const me = $derived(approvals.leaderMemberId());

	// Youth also in another of the leader's units, e.g. linking from Cubs to Scouts, with those units'
	// names: that section may still be signing off their records there
	let alsoIn = $state<Record<string, string[]>>({});
	let alsoInFor = '';
	async function loadAlsoIn(unitId: string) {
		if (app.isYouth || alsoInFor === unitId) return;
		alsoInFor = unitId;
		const found: Record<string, string[]> = {};
		// Only units the leader leads list their youth
		for (const other of app.units.filter((u) => u.id !== unitId && !app.youthIn(u.id))) {
			try {
				for (const m of await members.youth(other.id)) (found[m.id] ??= []).push(other.name);
			} catch {
				// A unit whose youth can't be read just isn't checked
			}
		}
		if (alsoInFor === unitId) alsoIn = found;
	}
	$effect(() => {
		const id = app.unitId;
		alsoIn = {};
		alsoInFor = '';
		if (id) untrack(() => loadAlsoIn(id));
	});

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

	// Youth on the Unit Council approve and award; submitting for others is the leaders'
	const youthView = $derived(app.isYouth);

	$effect(() => {
		const loaded = loadedUnits;
		if (!youthView) for (const unit of loaded) untrack(() => readyToSubmit.loadIfNeeded(unit.id));
	});

	const submitted = (r: Ready) => isSubmitted(r, pending);

	function showList(id: string, list: PendingApproval[]) {
		pending = list;
		// Keeps the badge on More and Approvals in step, e.g. once the leader has voted
		approvalsBadge.update(id, list, loadedUnits);
	}

	/** Shows what the leader did straight away, then reloads the list from Terrain */
	async function recordAction(list: PendingApproval[], action: Actioned['action']) {
		for (const approval of list)
			actioned.set(approval.submissionId, { action, wasAward: approval.isAward });
		showList(unitsId, withActioned(pending, actioned, approvals.leader()).list);
		checksAgain = 0;
		await load();
	}

	// Refresh and pull to refresh read Terrain again
	const refresh = () => {
		if (!youthView) for (const unit of loadedUnits) readyToSubmit.loadIfNeeded(unit.id, true);
		return load();
	};

	// No more checking once the page closes
	$effect(() => () => clearTimeout(checkTimer));

	$effect(() => {
		// Approvals are for the Unit Council; a youth not on it goes back to Home
		if (app.isYouth && !app.onUnitCouncil) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		void unitsId;
		// Youth have no Submit tab
		if (app.isYouth && untrack(() => tab) === 'submit') tab = 'approve';
		actioned = new SvelteMap();
		ticked.clear();
		confirmingAwards = '';
		loadedUnits = [];
		failedUnits = [];
		clearTimeout(checkTimer);
		pending = [];
		youthFilter = [];
		message = null;
		confirming = '';
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
				const items = pending.filter((a) => a.unitId === unit.id && shownName(a.memberName));
				const toAward = items.filter((a) => a.isAward);
				const unitReady = sortBy(
					ready.filter(
						(r) =>
							r.unitId === unit.id &&
							shownName(r.name) &&
							!submitted(r) &&
							!submittedHere.has(readyKey(r))
					),
					asc((r) => (groupByMember ? r.name : r.title)),
					asc((r) => (groupByMember ? r.title : r.name))
				);
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
					tickedAwards: awardable.filter((a) => ticked.has(a.submissionId)),
					ready: unitReady,
					readyGroups: groupBy(unitReady, (r) => (groupByMember ? r.name : readyTitle(r))),
					tickable: unitReady.filter((r) => !r.blocked),
					tickedReady: unitReady.filter((r) => !r.blocked && tickedReady.has(readyKey(r)))
				};
			})
			.filter((view) => view.items.length > 0 || view.ready.length > 0)
	);
	type UnitView = (typeof unitViews)[number];
	// Units get a heading of their own once the leader has more than one listed
	const severalUnits = $derived(loadedUnits.length > 1);
	const countText = $derived(counts(pending));
	// Each tab's count, of those the filter shows
	const tabCounts = $derived({
		approve: unitViews.reduce((n, v) => n + v.toApprove.length, 0),
		award: unitViews.reduce((n, v) => n + v.toAward.length, 0),
		submit: unitViews.reduce((n, v) => n + v.ready.length, 0)
	});
	const TABS: { key: Tab; label: string }[] = $derived([
		{ key: 'approve', label: 'Approve' },
		{ key: 'award', label: 'Award' },
		...(youthView ? [] : [{ key: 'submit' as const, label: 'Submit' }])
	]);
	// Every youth with something listed, to filter by
	const youthNames = $derived(
		sortBy(
			distinct([...pending.map((a) => a.memberName), ...ready.map((r) => r.name)]),
			asc((n) => n)
		)
	);
	// The unit, or the group when several units are listed together
	const summaryName = $derived(
		loadedUnits.length === 1
			? loadedUnits[0].name
			: loadedUnits.length > 1
				? app.groupName
				: app.unitName
	);
	const names = (voters: { name: string }[]) => voters.map((v) => v.name).join(', ');

	async function approve(approval: PendingApproval) {
		if (working) return;
		working = approval.submissionId;
		message = null;
		const result = await approvals.approve(approval);
		// Only once the approval is in: a plan Terrain hasn't approved can't move on
		const moved =
			result.success && moveToReview && !youthView && mayMoveToReview(approval)
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

{#snippet alsoInNote(memberId: string, name: string)}
	{#if alsoIn[memberId]?.length}
		<div class="small also-in">
			<Icon name="warning" />
			{name.split(' ')[0]} is also in {alsoIn[memberId].join(' and ')}. Check that section isn't
			still signing off their records.
		</div>
	{/if}
{/snippet}

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
		<!-- When it was submitted and how the votes stand, on one line where there's room -->
		<div class="small votes">
			<span class="muted"
				>{approval.submissionType} · submitted {submittedDisplay(approval.submittedOn)}</span
			>
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
		{@render alsoInNote(approval.memberId, approval.memberName)}

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
					{#if mayMoveToReview(approval) && !youthView}
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
	{#if tab === 'approve' && view.reviewGroups.length > 0}
		<section class="approval-section" aria-label="To approve">
			<p class="small muted">
				Submitted for the Unit Council's review: approve each after a confirm.
			</p>
			{@render approvalGroups(view.reviewGroups)}
		</section>
	{/if}
	{#if tab === 'award' && view.awardGroups.length > 0}
		<section class="approval-section" aria-label="Ready to award">
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
	{#if tab === 'submit' && view.ready.length > 0}
		<section class="approval-section" aria-label="Ready to submit">
			<p class="small muted">
				Milestones and OAS stages with every requirement done, but not submitted for review yet.
				Tick the ones to submit together.
			</p>
			<div class="award-bar">
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					disabled={working !== ''}
					onclick={() => toggleAllReady(view)}
					>{view.tickedReady.length === view.tickable.length ? 'Untick all' : 'Tick all'}</button
				>
				<button
					type="button"
					class="btn btn-sm btn-primary"
					disabled={working !== '' || view.tickedReady.length === 0}
					onclick={() => (confirmingSubmit = view.unit.id)}
					><Icon name="check" /> Submit {view.tickedReady.length > 0
						? view.tickedReady.length
						: ''}</button
				>
			</div>
			{#if confirmingSubmit === view.unit.id && view.tickedReady.length > 0}
				<div class="confirm-box">
					<strong
						>Submit {view.tickedReady.length === 1
							? `${readyTitle(view.tickedReady[0])} for ${view.tickedReady[0].name}`
							: `these ${view.tickedReady.length}`} for review?</strong
					>
					{#if view.tickedReady.length > 1}
						<ul class="small award-list">
							{#each view.tickedReady as r (readyKey(r))}
								<li>{readyTitle(r)}, {r.name}</li>
							{/each}
						</ul>
					{/if}
					<p class="small">
						Beacon switches to each youth's profile in turn, submits each for review (marking a
						milestone's leads as reviewed by a leader), then switches back.
					</p>
					<button
						type="button"
						class="btn btn-sm btn-success"
						disabled={working !== ''}
						onclick={() => submitTicked(view)}
						>{working === 'submitting' ? 'Submitting...' : 'Yes, submit'}</button
					>
					<button
						type="button"
						class="btn btn-sm btn-outline-secondary"
						disabled={working !== ''}
						onclick={() => (confirmingSubmit = '')}>Cancel</button
					>
				</div>
			{/if}
			{#each view.readyGroups as group (group.key)}
				<section class="approval-group" aria-label={group.key}>
					<div class="group-heading">
						{group.key} <span class="muted">({group.items.length})</span>
					</div>
					{#each group.items as r (readyKey(r))}
						<div class="approval-card">
							<div class="strong">{groupByMember ? readyTitle(r) : r.name}</div>
							<div class="small muted">
								{r.stage
									? 'Every statement and the logbook ticked'
									: 'Every participate and lead done'}
								· not submitted yet
							</div>
							{@render alsoInNote(r.memberId, r.name)}
							{#if r.blocked}
								<div class="small muted award-note">{r.blocked}, before Terrain takes it.</div>
							{:else}
								<label class="small award-pick"
									><input
										type="checkbox"
										class="form-check-input"
										disabled={working !== ''}
										checked={tickedReady.has(readyKey(r))}
										onchange={(e) =>
											e.currentTarget.checked
												? tickedReady.add(readyKey(r))
												: tickedReady.delete(readyKey(r))}
									/>
									Submit {readyTitle(r)} for {r.name}</label
								>
							{/if}
						</div>
					{/each}
				</section>
			{/each}
		</section>
	{/if}
{/snippet}

<div use:pullToRefresh={refresh}>
	<div class="approvals-header">
		<h2>Approvals</h2>
		<span class="header-buttons">
			<button
				type="button"
				class="btn icon-btn {showFilters ? 'btn-primary' : 'btn-outline-secondary'}"
				onclick={() => (showFilters = !showFilters)}
				disabled={!unitsId}
				aria-expanded={showFilters}
				title="Filters"
				aria-label="Filters"
			>
				<Icon name="list" />
			</button>
			<button
				type="button"
				class="btn icon-btn btn-outline-secondary"
				onclick={refresh}
				disabled={loading || !unitsId}
				title="Check Terrain again"
				aria-label="Refresh"
			>
				<Icon name="reload" />
			</button>
		</span>
	</div>

	{#if !unitsId}
		<ChooseUnit />
	{:else}
		<p class="small muted summary">
			{summaryName}{loading || !countText ? '' : ` · ${countText}`}
		</p>

		{#if showFilters}
			<div class="card filters">
				{#if youthNames.length > 1}
					<MultiSelect
						id="approvalsYouth"
						label="Youth"
						options={youthNames}
						bind:selected={youthFilter}
						noun="youth"
					/>
				{/if}
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
				<a class="btn btn-outline-secondary btn-sm" href={pagePath('approvals/history/')}
					>View history</a
				>
			</div>
		{/if}

		<div class="tabs" role="tablist">
			{#each TABS as t (t.key)}
				<button type="button" role="tab" aria-selected={tab === t.key} onclick={() => (tab = t.key)}
					>{t.label}{#if tabCounts[t.key] > 0}
						&nbsp;<span class="badge">{tabCounts[t.key]}</span>{/if}</button
				>
			{/each}
		</div>

		{#if tab === 'submit'}
			<YouthLoadProgress
				unitId={app.unitId}
				label="Loading youth to find what's ready to submit:"
			/>
			{#if readyChecking}
				<p class="small muted">Checking for milestones and stages ready to submit...</p>
			{/if}
		{/if}

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

		{#if loading && pending.length === 0 && tab !== 'submit'}
			<p class="muted">Loading approvals from Terrain...</p>
		{:else if errorMessage}
			<div class="alert alert-danger">{errorMessage}</div>
		{:else if loadedUnits.length === 0 && failedUnits.length === 0 && !loading}
			<div class="approvals-empty">
				<Icon name="circle-check" />
				Terrain doesn't list approvals for you in this unit: they're for its Unit Council members.
			</div>
		{:else if tabCounts[tab] === 0 && !(tab === 'submit' && readyChecking)}
			<div class="approvals-empty">
				<Icon name="circle-check" />
				{youthFilter.length > 0 ? 'Nothing for the youth picked ' : 'Nothing '}{tab === 'approve'
					? 'waiting for approval.'
					: tab === 'award'
						? 'approved and waiting to be awarded.'
						: 'ready to submit.'}
			</div>
		{:else}
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

	.header-buttons {
		display: inline-flex;
		gap: 0.5rem;
	}

	.filters {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.group-by {
		max-width: 14rem;
		margin-bottom: 0;
	}

	.also-in {
		margin-top: 0.3rem;
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius);
		background: var(--alert-warning-bg);
		color: var(--alert-warning-text);
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
