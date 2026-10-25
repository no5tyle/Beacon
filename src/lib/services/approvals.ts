// The unit's submissions waiting for the Unit Council, and approving and awarding them. Ported from
// Beacon's C# ApprovalsService, with approving and awarding added from Terrain's own Approvals tab.

import {
	decidedSubmissions,
	isAwardDate,
	isSIAPlan,
	mayMoveToReview,
	moveToReviewBody,
	pendingApprovals,
	withProjectNames,
	type DecidedSubmission,
	type PendingApproval,
	type Voter
} from '#lib/model/approvals.js';
import { TerrainError, type TerrainWriteResult } from '#lib/terrain/errors.js';
import type { BeaconContext } from './context.js';

/** A unit to list approvals for */
export interface ApprovalsUnit {
	id: string;
	name: string;
}

/** Each of the leader's units' lists together, and the units Terrain couldn't be reached for */
export interface UnitsResult<T> {
	list: T[];
	/** Units whose lists Terrain gave, in the order given */
	loaded: ApprovalsUnit[];
	/** Units that failed for some other reason than not being the leader's to see, e.g. no signal */
	failed: ApprovalsUnit[];
}

/**
 * Terrain refuses a unit's approvals to a leader who isn't on its Unit Council. That unit is simply left
 * out; anything else (no signal, Terrain down) is reported as failed
 */
const isRefused = (error: unknown) =>
	error instanceof TerrainError && error.status >= 400 && error.status < 500;

/** Reads each unit at once, labels what it has with the unit, and keeps the units in the order given */
async function acrossUnits<T extends { unitId: string; unitName: string }>(
	units: readonly ApprovalsUnit[],
	read: (unitId: string) => Promise<T[]>
): Promise<UnitsResult<T>> {
	const results = await Promise.allSettled(units.map((u) => read(u.id)));
	const list: T[] = [];
	const loaded: ApprovalsUnit[] = [];
	const failed: ApprovalsUnit[] = [];
	results.forEach((result, i) => {
		const unit = units[i];
		if (result.status === 'fulfilled') loaded.push(unit);
		if (result.status === 'fulfilled')
			list.push(...result.value.map((item) => ({ ...item, unitId: unit.id, unitName: unit.name })));
		else if (!isRefused(result.reason)) failed.push(unit);
	});
	// Nothing loaded and some couldn't be reached: say so rather than show an empty list
	if (loaded.length === 0 && failed.length > 0)
		throw results
			.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
			.find((r) => !isRefused(r.reason))!.reason;
	return { list, loaded, failed };
}

export class ApprovalsService {
	constructor(private readonly context: BeaconContext) {}

	/**
	 * Submissions in the unit waiting for the Unit Council, oldest first. Terrain's list gives a special
	 * interest area only its area, so each youth's projects are read for their names, as Progress reads them
	 */
	async pending(unitId: string, { names = true } = {}): Promise<PendingApproval[]> {
		const list = pendingApprovals(await this.context.terrain.unitSubmissions(unitId, 'pending'));
		if (!names) return list;
		const youth = [
			...new Set(
				list.filter((a) => a.achievementType === 'special_interest_area').map((a) => a.memberId)
			)
		];
		// A name that can't be read leaves the area as the title
		const records = await Promise.all(
			youth.map((memberId) =>
				this.context.terrain.memberAchievements(memberId, 'special_interest_area').catch(() => [])
			)
		);
		return withProjectNames(list, records.flat());
	}

	/** Submissions the Unit Council has finished with, most recently decided first */
	async history(unitId: string): Promise<DecidedSubmission[]> {
		return decidedSubmissions(await this.context.terrain.unitSubmissions(unitId, 'finalised'));
	}

	/**
	 * What's waiting in each of the leader's units, in the order given. A unit whose Unit Council the
	 * leader isn't on is left out, as Terrain won't list it for them. Without names, special interest
	 * area project names aren't read, e.g. for the badge, which only counts
	 */
	pendingIn(
		units: readonly ApprovalsUnit[],
		options: { names?: boolean } = {}
	): Promise<UnitsResult<PendingApproval>> {
		return acrossUnits(units, (id) => this.pending(id, options));
	}

	/** The history of each of the leader's units together, most recently decided first */
	async historyIn(units: readonly ApprovalsUnit[]): Promise<UnitsResult<DecidedSubmission>> {
		const result = await acrossUnits(units, (id) => this.history(id));
		const time = (value: string) => Date.parse(value) || 0;
		result.list.sort((a, b) => time(b.decidedOn) - time(a.decidedOn));
		return result;
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

	/**
	 * Awards several on the same day, one after another, as handing out badges together does. Each has its
	 * own result, so one Terrain refuses doesn't stop the rest
	 */
	async awardMany(
		list: readonly PendingApproval[],
		dateAwarded: string
	): Promise<{ approval: PendingApproval; result: TerrainWriteResult }[]> {
		const results: { approval: PendingApproval; result: TerrainWriteResult }[] = [];
		for (const approval of list)
			results.push({ approval, result: await this.award(approval, dateAwarded) });
		return results;
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

	/** The signed in leader, as a voter on what they've just approved */
	leader(): Voter {
		const member = this.context.profiles?.profiles[0]?.member;
		return { memberId: member?.id ?? '', name: member?.name ?? '' };
	}
}
