// How many submissions are waiting for the signed in leader's vote in the chosen unit, for the badge on
// More and Approvals. Loaded in the background once a leader has a unit, and updated whenever the
// Approvals page loads the list.

import {
	canApproveInBeacon,
	canAwardInBeacon,
	hasVoted,
	type PendingApproval
} from '#lib/model/approvals.js';
import type { ApprovalsService } from '#lib/services/approvals.js';

/** Waiting for this leader: they can approve it in Beacon and haven't voted on it yet, or can award it */
export const waitingForLeader = (list: readonly PendingApproval[], leaderMemberId: string) =>
	list.filter((a) => (canApproveInBeacon(a) && !hasVoted(a, leaderMemberId)) || canAwardInBeacon(a))
		.length;

export class ApprovalsBadge {
	/** The unit the count is for */
	unitId = $state('');
	waiting = $state(0);
	private loading = '';

	constructor(private readonly approvals: ApprovalsService) {}

	/** Loads the count for a unit, unless it's already known or loading. Never throws */
	async loadIfNeeded(unitId: string): Promise<void> {
		if (!unitId || unitId === this.unitId || unitId === this.loading) return;
		this.loading = unitId;
		try {
			const list = await this.approvals.pending(unitId);
			if (this.loading === unitId) this.update(unitId, list);
		} catch (error) {
			// The badge is a nicety: leave it off, and the Approvals page shows any error
			console.info('Approvals: badge not loaded', error);
		} finally {
			if (this.loading === unitId) this.loading = '';
		}
	}

	/** The latest list for a unit, e.g. after the Approvals page loads it or the leader approves */
	update(unitId: string, list: readonly PendingApproval[]): void {
		this.unitId = unitId;
		this.waiting = waitingForLeader(list, this.approvals.leaderMemberId());
	}

	clear(): void {
		this.unitId = '';
		this.waiting = 0;
		this.loading = '';
	}
}
