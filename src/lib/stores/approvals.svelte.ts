// The badge on More and Approvals: everything on Approvals' three tabs for the chosen unit, to approve,
// to award and ready to submit. The approvals list loads in the background once a leader has a unit,
// and follows whatever the Approvals page loads; what's ready to submit comes from ReadyToSubmit.

import type { PendingApproval } from '#lib/model/approvals.js';
import type { ApprovalsService, ApprovalsUnit } from '#lib/services/approvals.js';
import type { ReadyToSubmit } from './readyToSubmit.svelte.js';

/** Which units a count is for, e.g. "unit-1,unit-2" */
export const unitsKey = (units: readonly ApprovalsUnit[]) => units.map((u) => u.id).join(',');

export class ApprovalsBadge {
	/** The units the list is for, as unitsKey gives them */
	key = $state('');
	/** Terrain's approvals list for them: to approve and to award */
	list = $state.raw<readonly PendingApproval[]>([]);
	/** The units Terrain listed approvals for: those whose Unit Council the leader is on */
	loadedIds = $state.raw<readonly string[]>([]);
	private loading = '';

	constructor(private readonly approvals: ApprovalsService) {}

	/** Loads the list across the leader's units, unless it's already known or loading. Never throws */
	async loadIfNeeded(units: readonly ApprovalsUnit[]): Promise<void> {
		const key = unitsKey(units);
		if (!key || key === this.key || key === this.loading) return;
		this.loading = key;
		try {
			const { list, loaded } = await this.approvals.pendingIn(units, { names: false });
			if (this.loading === key) this.update(key, list, loaded);
		} catch (error) {
			// The badge is a nicety: leave it off, and the Approvals page shows any error
			console.info('Approvals: badge not loaded', error);
		} finally {
			if (this.loading === key) this.loading = '';
		}
	}

	/** The latest list for the units, e.g. after the Approvals page loads it or the leader approves */
	update(
		key: string,
		list: readonly PendingApproval[],
		loaded: readonly ApprovalsUnit[] = []
	): void {
		this.key = key;
		this.list = list;
		this.loadedIds = loaded.map((u) => u.id);
	}

	/**
	 * The count for the units: everything to approve and award, and, in units whose approvals Terrain
	 * lists, what's ready to submit, as the Approvals page's three tabs count them
	 */
	count(key: string, ready: ReadyToSubmit): number {
		if (key !== this.key) return 0;
		const submit = this.loadedIds.reduce((n, id) => n + ready.readyIn(id, this.list).length, 0);
		return this.list.length + submit;
	}

	clear(): void {
		this.key = '';
		this.list = [];
		this.loadedIds = [];
		this.loading = '';
	}
}
