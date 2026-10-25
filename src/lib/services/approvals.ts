// The unit's submissions waiting for the Unit Council, and approving and awarding them. Ported from
// Beacon's C# ApprovalsService, with approving and awarding added from Terrain's own Approvals tab.

import {
	decidedSubmissions,
	isAwardDate,
	isSIAPlan,
	mayMoveToReview,
	moveToReviewBody,
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
		// An award isn't approved with a review vote: it's awarded
		if (approval.isAward)
			return { success: false, status: 0, body: 'This one is ready to award, not approve.' };
		return this.send(() =>
			this.context.terrain.assessSubmission(approval.submissionId, 'approved')
		);
	}

	/** Awards a submission the Unit Council has approved, on a day such as "2026-10-25". Sent as the leader */
	async award(approval: PendingApproval, dateAwarded: string): Promise<TerrainWriteResult> {
		if (!approval.canAction)
			return { success: false, status: 0, body: "Terrain doesn't let you award this one." };
		if (!approval.isAward)
			return { success: false, status: 0, body: 'The Unit Council needs to approve this first.' };
		if (!isAwardDate(dateAwarded))
			return { success: false, status: 0, body: 'Choose the day it was awarded, up to today.' };
		return this.send(() =>
			this.context.terrain.awardSubmission(approval.submissionId, dateAwarded)
		);
	}

	/**
	 * After the deciding approval of a special interest area plan, moves it on to the review, as the youth
	 * would in Terrain. Terrain takes it only from the youth's profile, so it's sent as the youth. Reads the
	 * record fresh first and leaves it alone unless it's still the plan. Says false in moved when there was
	 * nothing to move
	 */
	async moveToReview(approval: PendingApproval): Promise<TerrainWriteResult & { moved: boolean }> {
		if (!mayMoveToReview(approval))
			return {
				success: false,
				status: 0,
				body: 'Only a special interest area plan moves on.',
				moved: false
			};
		const { memberId, achievementId } = approval;
		try {
			const outcome = await this.context.terrain.actAsYouth(memberId, async (youth) => {
				const record = (await youth.memberAchievements(memberId, 'special_interest_area')).find(
					(a) => a.id === achievementId
				);
				if (!record || !isSIAPlan(record))
					return { success: true, status: 0, body: '', moved: false };
				const result = await youth.updateAchievement(
					memberId,
					achievementId,
					moveToReviewBody(record)
				);
				return { ...result, moved: result.success };
			});
			if (!outcome.acted) return { ...outcome.result, success: false, moved: false };
			return outcome.value;
		} catch (error) {
			return {
				success: false,
				status: 0,
				body: error instanceof Error ? error.message : String(error),
				moved: false
			};
		}
	}

	private async send(write: () => Promise<TerrainWriteResult>): Promise<TerrainWriteResult> {
		try {
			return await write();
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
