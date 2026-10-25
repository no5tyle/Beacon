<!--
	Approvals: the unit's submissions waiting for the Unit Council, as Terrain's Approvals tab lists them,
	with an Approve button on reviews and an Award button on awards Terrain lets the leader action, and a
	history of those it has finished with.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import {
		canApproveInBeacon,
		canAwardInBeacon,
		decidedWithin,
		hasVoted,
		isAwardDate,
		localDate,
		mayMoveToReview,
		outcomeDisplay,
		RECENT_DAYS,
		submittedDisplay,
		VOTES_NEEDED,
		type DecidedSubmission,
		type PendingApproval
	} from '#lib/model/approvals.js';
	import { asc, distinct, groupBy, sortBy } from '#lib/model/util.js';
	import { pagePath } from '#lib/paths.js';
	import { app, approvals, approvalsBadge } from '#lib/services/index.js';

	let pending = $state<PendingApproval[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	// Youth to show (none picked means everyone), and how the cards are grouped
	let selectedNames = $state<string[]>([]);
	let groupByMember = $state(false);
	let confirming = $state('');
	// The day an award is recorded against, today unless the leader picks an earlier one
	let awardDate = $state(localDate());
	// Whether approving a special interest area plan through also moves it on to the review for the youth
	let moveToReview = $state(true);
	let working = $state('');
	let message = $state<{ text: string; isError: boolean } | null>(null);
	let tab = $state<'waiting' | 'history'>('waiting');
	// The history loads the first time its tab is opened, for the unit it was loaded for
	let history = $state<DecidedSubmission[]>([]);
	let historyFor = $state('');
	let historyLoading = $state(false);
	let historyError = $state('');
	let showOlder = $state(false);

	const unitId = $derived(app.unitId);
	const me = $derived(approvals.leaderMemberId());

	async function load() {
		const id = unitId;
		if (!id || loading) return;
		loading = true;
		errorMessage = '';
		try {
			const found = await approvals.pending(id);
			if (id !== app.unitId) return;
			pending = found;
			// Keeps the badge on More and Approvals in step, e.g. once the leader has voted
			approvalsBadge.update(id, found);
			selectedNames = selectedNames.filter((n) => found.some((a) => a.memberName === n));
		} catch {
			errorMessage = "Couldn't load approvals from Terrain. Try again in a moment.";
		} finally {
			loading = false;
		}
	}

	async function loadHistory() {
		const id = unitId;
		if (!id || historyLoading) return;
		historyLoading = true;
		historyError = '';
		try {
			const found = await approvals.history(id);
			if (id !== app.unitId) return;
			history = found;
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
		if (next === 'history' && historyFor !== unitId) loadHistory();
	}

	$effect(() => {
		// Approvals are for leaders on the Unit Council; a youth goes back to Home
		if (app.isYouth) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		void unitId;
		pending = [];
		history = [];
		historyFor = '';
		showOlder = false;
		message = null;
		confirming = '';
		if (untrack(() => tab) === 'history') untrack(loadHistory);
		// Only the unit reloads the list; what load() reads, such as whether it is loading, mustn't
		untrack(load);
	});

	const memberNames = $derived(
		sortBy(
			distinct(pending.map((a) => a.memberName)),
			asc((n) => n)
		)
	);
	const grouped = $derived(
		groupBy(
			sortBy(
				pending.filter((a) => selectedNames.length === 0 || selectedNames.includes(a.memberName)),
				asc((a) => (groupByMember ? a.memberName : a.achievementName)),
				asc((a) => Date.parse(a.submittedOn) || 0)
			),
			(a) => (groupByMember ? a.memberName : a.achievementName)
		)
	);
	const countText = $derived(
		pending.length === 1
			? '1 waiting for the Unit Council'
			: `${pending.length} waiting for the Unit Council`
	);
	const names = (voters: { name: string }[]) => voters.map((v) => v.name).join(', ');

	const historyNames = $derived(
		sortBy(
			distinct(history.map((h) => h.memberName)),
			asc((n) => n)
		)
	);
	const recentHistory = $derived(history.filter((h) => decidedWithin(h, RECENT_DAYS)));
	const shownHistory = $derived(
		(showOlder ? history : recentHistory).filter(
			(h) => selectedNames.length === 0 || selectedNames.includes(h.memberName)
		)
	);

	function toggleName(name: string) {
		selectedNames = selectedNames.includes(name)
			? selectedNames.filter((n) => n !== name)
			: [...selectedNames, name];
	}

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
			const approved = `Approved ${approval.achievementName} for ${approval.memberName}.`;
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
		// Terrain's list shows the new vote, or that the submission has gone through
		await load();
		// Something that went through belongs in the history now
		if (historyFor) historyFor = '';
	}

	function confirmApprove(approval: PendingApproval) {
		moveToReview = true;
		confirming = approval.submissionId;
	}

	function confirmAward(approval: PendingApproval) {
		awardDate = localDate();
		confirming = approval.submissionId;
	}

	async function award(approval: PendingApproval) {
		if (working) return;
		working = approval.submissionId;
		message = null;
		const result = await approvals.award(approval, awardDate);
		working = '';
		confirming = '';
		message = result.success
			? { text: `Awarded ${approval.achievementName} to ${approval.memberName}.`, isError: false }
			: {
					text:
						result.status > 0
							? `Terrain didn't accept the award (response ${result.status}). Check it in Terrain before trying again.`
							: result.body || "Couldn't award. Check it in Terrain before trying again.",
					isError: true
				};
		await load();
		if (historyFor) historyFor = '';
	}
</script>

<svelte:head>
	<title>Beacon / Approvals</title>
</svelte:head>

{#snippet youthChips(list: string[])}
	<div class="chip-group" aria-label="Youth">
		<button
			type="button"
			class="btn chip {selectedNames.length === 0 ? 'btn-primary' : 'btn-outline-primary'}"
			onclick={() => (selectedNames = [])}>Everyone</button
		>
		{#each list as name (name)}
			<button
				type="button"
				class="btn chip {selectedNames.includes(name) ? 'btn-primary' : 'btn-outline-primary'}"
				aria-pressed={selectedNames.includes(name)}
				onclick={() => toggleName(name)}>{name}</button
			>
		{/each}
	</div>
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
			<div class="filters">{@render youthChips(historyNames)}</div>
		{/if}
		<p class="small muted">
			{showOlder
				? `All ${history.length} the Unit Council has finished with, most recent first.`
				: `Finished with in the last ${RECENT_DAYS} days, most recent first.`}
		</p>
		{#if shownHistory.length === 0}
			<p class="muted">Nothing in the last {RECENT_DAYS} days.</p>
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
					{item.submissionType} · decided {submittedDisplay(item.decidedOn)} · submitted {submittedDisplay(
						item.submittedOn
					)}
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
			disabled={(tab === 'history' ? historyLoading : loading) || !unitId}
			title="Check Terrain again"
			aria-label="Refresh"
		>
			<Icon name="reload" />
		</button>
	</div>

	{#if !unitId}
		<ChooseUnit />
	{:else}
		<p class="small muted summary">
			{app.unitName}{loading ? '' : ` · ${countText}`}
		</p>

		<div class="tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'waiting'}
				onclick={() => showTab('waiting')}
				>Waiting{#if pending.length > 0}
					<span class="badge tab-count">{pending.length}</span>{/if}</button
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

		{#if tab === 'history'}
			{@render historyTab()}
		{:else if loading && pending.length === 0}
			<p class="muted">Loading approvals from Terrain...</p>
		{:else if errorMessage}
			<div class="alert alert-danger">{errorMessage}</div>
		{:else if pending.length === 0}
			<div class="approvals-empty">
				<Icon name="circle-check" />
				Nothing is waiting for approval.
			</div>
		{:else}
			{#if pending.length > 1}
				<div class="filters">
					{@render youthChips(memberNames)}
					<div class="field group-by">
						<label class="form-label small" for="groupBy">Group by</label>
						<select
							id="groupBy"
							class="form-select"
							value={groupByMember ? 'member' : 'achievement'}
							onchange={(e) => (groupByMember = e.currentTarget.value === 'member')}
						>
							<option value="achievement">Achievement</option>
							<option value="member">Youth</option>
						</select>
					</div>
				</div>
			{/if}

			{#each grouped as group (group.key)}
				<div class="group-heading">
					{group.key} <span class="muted">({group.items.length})</span>
				</div>
				{#each group.items as approval (approval.submissionId)}
					{@const voted = hasVoted(approval, me)}
					<div class="approval-card">
						<div class="strong">
							{groupByMember ? approval.achievementName : approval.memberName}
						</div>
						<div class="small muted">
							{approval.submissionType} · submitted {submittedDisplay(approval.submittedOn)}
						</div>
						<div class="small votes">
							{#if !approval.isAward}
								<span class={approval.approvedBy.length > 0 ? 'text-success' : 'muted'}>
									<Icon name="check" />
									{approval.approvedBy.length} of {VOTES_NEEDED} approved{approval.approvedBy
										.length > 0
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
							{#if confirming === approval.submissionId}
								<div class="confirm-box">
									<strong>Award {approval.achievementName} to {approval.memberName}?</strong>
									<p class="small">
										Terrain records it as awarded by you on the day you choose, and it leaves this
										list.
									</p>
									<div class="field award-date">
										<label class="form-label small" for="awardDate-{approval.submissionId}"
											>Date awarded</label
										>
										<input
											id="awardDate-{approval.submissionId}"
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
										onclick={() => award(approval)}
										>{working === approval.submissionId ? 'Awarding...' : 'Yes, award'}</button
									>
									<button
										type="button"
										class="btn btn-sm btn-outline-secondary"
										disabled={working !== ''}
										onclick={() => (confirming = '')}>Cancel</button
									>
								</div>
							{:else}
								<div class="small muted award-note">
									Approved by the Unit Council and ready to award.
								</div>
								<div class="actions">
									<button
										type="button"
										class="btn btn-sm btn-outline-primary"
										disabled={working !== ''}
										onclick={() => confirmAward(approval)}><Icon name="check" /> Award</button
									>
								</div>
							{/if}
						{:else if approval.isAward}
							<div class="small muted award-note">
								Approved by the Unit Council and ready to award.
							</div>
						{:else if canApproveInBeacon(approval) && !voted}
							{#if confirming === approval.submissionId}
								<div class="confirm-box">
									<strong>Approve {approval.achievementName} for {approval.memberName}?</strong>
									<p class="small">
										Terrain records your approval as a Unit Council member. It goes through once {VOTES_NEEDED}
										members have approved; this would be approval {approval.approvedBy.length + 1} of
										{VOTES_NEEDED}.
									</p>
									{#if mayMoveToReview(approval)}
										<label class="small move-to-review"
											><input
												type="checkbox"
												class="form-check-input"
												bind:checked={moveToReview}
											/>
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
				{/each}
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
	}

	.summary {
		margin-bottom: 0.75rem;
	}

	.tab-count {
		margin-left: 0.25rem;
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

	.filters .chip-group {
		margin-bottom: 0.5rem;
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
		border-radius: 0.5rem;
		background: var(--surface);
	}

	.votes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.75rem;
		margin-top: 0.15rem;
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

	.move-to-review {
		display: flex;
		gap: 0.4rem;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.award-date {
		max-width: 12rem;
		margin-bottom: 0.5rem;
	}

	.approvals-empty {
		padding: 1.5rem 1rem;
		border: 1px dashed var(--border);
		border-radius: 0.5rem;
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
