// The unit's submissions waiting for the Unit Council, and approving them. Ported from Beacon's C#
// ApprovalsService, with approving added from Terrain's own Approvals tab.

import {
	decidedSubmissions,
	pendingApprovals,
	type DecidedSubmission,
	type PendingApproval
} from '#lib/model/approvals.js';
import type { TerrainWriteResult } from '#lib/terrain/errors.js';
import type { BeaconContext } from './context.js';

export class ApprovalsService {
	constructor(private readonly context: BeaconContext) {}

	/** Submissions in the unit waiting for the Unit Council, oldest first */
	async pending(unitId: string): Promise<PendingApproval[]> {
		return pendingApprovals(await this.context.terrain.unitSubmissions(unitId, 'pending'));
	}

	/** Submissions the Unit Council has finished with, most recently decided first */
	async history(unitId: string): Promise<DecidedSubmission[]> {
		return decidedSubmissions(await this.context.terrain.unitSubmissions(unitId, 'finalised'));
	}

	/** Records the signed in leader's approval. Sent as the leader: approving isn't done as the youth */
	async approve(approval: PendingApproval): Promise<TerrainWriteResult> {
		if (!approval.canAction)
			return { success: false, status: 0, body: "Terrain doesn't let you approve this one." };
		try {
			return await this.context.terrain.assessSubmission(approval.submissionId, 'approved');
		} catch (error) {
			return {
				success: false,
				status: 0,
				body: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/** The signed in leader's member id, to tell whether they've already voted */
	leaderMemberId(): string {
		return this.context.profiles?.profiles[0]?.member.id ?? '';
	}
}
