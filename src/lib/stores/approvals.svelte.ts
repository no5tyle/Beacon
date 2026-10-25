// How many submissions are waiting for the signed in leader's vote in the chosen unit, for the badge on
// More and Approvals. Loaded in the background once a leader has a unit, and updated whenever the
// Approvals page loads the list.

import {
	canApproveInBeacon,
	canAwardInBeacon,
	hasVoted,
	type PendingApproval
} from '#lib/model/approvals.js';
import type { ApprovalsService, ApprovalsUnit } from '#lib/services/approvals.js';

/** Waiting for this leader: they can approve it in Beacon and haven't voted on it yet, or can award it */
export const waitingForLeader = (list: readonly PendingApproval[], leaderMemberId: string) =>
	list.filter((a) => (canApproveInBeacon(a) && !hasVoted(a, leaderMemberId)) || canAwardInBeacon(a))
		.length;

/** Which units a count is for, e.g. "unit-1,unit-2" */
export const unitsKey = (units: readonly ApprovalsUnit[]) => units.map((u) => u.id).join(',');

export class ApprovalsBadge {
	/** The units the count is for, as unitsKey gives them */
	key = $state('');
	waiting = $state(0);
	private loading = '';

	constructor(private readonly approvals: ApprovalsService) {}

	/** Loads the count across the leader's units, unless it's already known or loading. Never throws */
	async loadIfNeeded(units: readonly ApprovalsUnit[]): Promise<void> {
		const key = unitsKey(units);
		if (!key || key === this.key || key === this.loading) return;
		this.loading = key;
		try {
			const { list } = await this.approvals.pendingIn(units, { names: false });
			if (this.loading === key) this.update(key, list);
		} catch (error) {
			// The badge is a nicety: leave it off, and the Approvals page shows any error
			console.info('Approvals: badge not loaded', error);
		} finally {
			if (this.loading === key) this.loading = '';
		}
	}

	/** The latest list for the units, e.g. after the Approvals page loads it or the leader approves */
	update(key: string, list: readonly PendingApproval[]): void {
		this.key = key;
		this.waiting = waitingForLeader(list, this.approvals.leaderMemberId());
	}

	clear(): void {
		this.key = '';
		this.waiting = 0;
		this.loading = '';
	}
}
