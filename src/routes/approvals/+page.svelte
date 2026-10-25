<!--
	Approvals: the unit's submissions waiting for the Unit Council, as Terrain's Approvals tab lists them,
	with an Approve button on those Terrain lets the leader action.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import ChooseUnit from '#lib/components/ChooseUnit.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { pullToRefresh } from '#lib/actions/pullToRefresh.js';
	import {
		hasVoted,
		submittedDisplay,
		VOTES_NEEDED,
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
	let working = $state('');
	let message = $state<{ text: string; isError: boolean } | null>(null);

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

	$effect(() => {
		// Approvals are for leaders on the Unit Council; a youth goes back to Home
		if (app.isYouth) {
			goto(pagePath(''), { replaceState: true });
			return;
		}
		void unitId;
		pending = [];
		message = null;
		confirming = '';
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
		working = '';
		confirming = '';
		if (result.success) {
			const votes = approval.approvedBy.length + 1;
			message = {
				text:
					votes >= VOTES_NEEDED
						? `Approved ${approval.achievementName} for ${approval.memberName}.`
						: `Approved ${approval.achievementName} for ${approval.memberName}. It needs ${VOTES_NEEDED - votes} more Unit Council ${VOTES_NEEDED - votes === 1 ? 'member' : 'members'} to approve.`,
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
	}
</script>

<svelte:head>
	<title>Beacon / Approvals</title>
</svelte:head>

<div use:pullToRefresh={load}>
	<div class="approvals-header">
		<h2>Approvals</h2>
		<button
			type="button"
			class="btn icon-btn btn-outline-secondary"
			onclick={load}
			disabled={loading || !unitId}
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

		{#if message}
			<div class="alert {message.isError ? 'alert-danger' : 'alert-success'}" role="status">
				{message.text}
			</div>
		{/if}

		{#if loading && pending.length === 0}
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
					<div class="chip-group" aria-label="Youth">
						<button
							type="button"
							class="btn chip {selectedNames.length === 0 ? 'btn-primary' : 'btn-outline-primary'}"
							onclick={() => (selectedNames = [])}>Everyone</button
						>
						{#each memberNames as name (name)}
							<button
								type="button"
								class="btn chip {selectedNames.includes(name)
									? 'btn-primary'
									: 'btn-outline-primary'}"
								aria-pressed={selectedNames.includes(name)}
								onclick={() => toggleName(name)}>{name}</button
							>
						{/each}
					</div>
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
							<span class={approval.approvedBy.length > 0 ? 'text-success' : 'muted'}>
								<Icon name="check" />
								{approval.approvedBy.length} of {VOTES_NEEDED} approved{approval.approvedBy.length >
								0
									? ` (${names(approval.approvedBy)})`
									: ''}
							</span>
							{#if approval.improveBy.length > 0}
								<span class="text-danger">
									<Icon name="action-undo" />
									Needs improvement: {names(approval.improveBy)}
								</span>
							{/if}
						</div>

						{#if approval.canAction && !voted}
							{#if confirming === approval.submissionId}
								<div class="confirm-box">
									<strong>Approve {approval.achievementName} for {approval.memberName}?</strong>
									<p class="small">
										Terrain records your approval as a Unit Council member. It goes through once {VOTES_NEEDED}
										members have approved; this would be approval {approval.approvedBy.length + 1} of
										{VOTES_NEEDED}.
									</p>
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
										onclick={() => (confirming = approval.submissionId)}
										><Icon name="check" /> Approve</button
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
	.voted {
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
