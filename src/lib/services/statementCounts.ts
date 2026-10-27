// How many of a unit's youth have each "I" statement of a stage, for the Reference when a leader is
// signed in. Counted from the unit's records for the stage; nothing is kept beyond the page.

import { isTrue } from '#lib/model/oas/answers.js';
import { latestByMember, type UnitOASRecord } from '#lib/model/oas/signOff.js';
import type { BeaconContext } from './context.js';
import type { MembersService } from './members.js';

export interface StageCounts {
	/** Youth in the unit */
	youth: number;
	/** Youth who have completed the stage, so have every statement */
	completed: number;
	/** For each statement, the other youth who have it ticked */
	ticked: Record<string, number>;
}

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
		const counts: StageCounts = { youth: youth.length, completed: 0, ticked: {} };
		for (const record of latest.values()) {
			if (COMPLETE.includes(record.status)) {
				counts.completed++;
				continue;
			}
			for (const [inputId, value] of Object.entries(record.answers ?? {}))
				if (isTrue(value)) counts.ticked[inputId] = (counts.ticked[inputId] ?? 0) + 1;
		}
		return counts;
	}
}
