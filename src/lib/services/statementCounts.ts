// How many of a unit's youth have each "I" statement of a stage, for the Reference when a leader is
// signed in, and who doesn't have each yet for a printout. Counted from the unit's records for the stage;
// nothing is kept beyond the page.

import { isTrue } from '#lib/model/oas/answers.js';
import { latestByMember, type UnitOASRecord } from '#lib/model/oas/signOff.js';
import { asc, sortBy } from '#lib/model/util.js';
import type { BeaconContext } from './context.js';
import type { MembersService } from './members.js';

export interface StageCounts {
	/** Youth in the unit */
	youth: number;
	/** Youth who have completed the stage, so have every statement */
	completed: number;
	/** For each statement, the other youth who have it ticked */
	ticked: Record<string, number>;
	/** Each youth's name, in name order, for listing who doesn't have a statement yet */
	names: { id: string; name: string }[];
	completedIds: string[];
	/** For each statement, the youth (other than those completed) who have it ticked */
	tickedIds: Record<string, string[]>;
}

/** The youth who don't have a statement yet, by name */
export const lacking = (counts: StageCounts, inputId: string) =>
	counts.names
		.filter(
			(y) => !counts.completedIds.includes(y.id) && !counts.tickedIds[inputId]?.includes(y.id)
		)
		.map((y) => y.name);

const COMPLETE = ['awarded', 'approved'];

export class StatementCountsService {
	constructor(
		private readonly context: BeaconContext,
		private readonly members: MembersService
	) {}

	async stageCounts(
		unitId: string,
		stage: { stream: string; branch: string; stage: number }
	): Promise<StageCounts> {
		const [youth, records] = await Promise.all([
			this.members.youth(unitId),
			this.context.terrain.unitOASAchievements(unitId, stage.stream, stage.branch, stage.stage)
		]);
		const ids = new Set(youth.map((m) => m.id));
		const latest = latestByMember(
			records.filter((r) => ids.has(String(r.member_id))) as unknown as UnitOASRecord[],
			stage.branch
		);
		const counts: StageCounts = {
			youth: youth.length,
			completed: 0,
			ticked: {},
			names: sortBy(
				youth.map((m) => ({ id: m.id, name: this.members.displayName(m) })),
				asc((y) => y.name)
			),
			completedIds: [],
			tickedIds: {}
		};
		for (const [memberId, record] of latest) {
			if (COMPLETE.includes(record.status)) {
				counts.completed++;
				counts.completedIds.push(memberId);
				continue;
			}
			for (const [inputId, value] of Object.entries(record.answers ?? {}))
				if (isTrue(value)) {
					counts.ticked[inputId] = (counts.ticked[inputId] ?? 0) + 1;
					(counts.tickedIds[inputId] ??= []).push(memberId);
				}
		}
		return counts;
	}
}
