// Adding activities to a unit's programme, as Terrain's activity planner does.

import { activityProblems, eventBody, type ActivityDraft } from '#lib/model/activity.js';
import type { TerrainWriteResult } from '#lib/terrain/errors.js';
import type { BeaconContext } from './context.js';

export class ActivitiesService {
	constructor(private readonly context: BeaconContext) {}

	/**
	 * Saves an activity that's over to the unit's programme as the leader, its organiser: added already
	 * concluded, with its review and logbook, so those who came get credit for it
	 */
	async save(
		draft: ActivityDraft,
		unitId: string,
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
		now = new Date()
	): Promise<TerrainWriteResult> {
		const leader = this.context.profiles?.profiles[0]?.member;
		const problems = activityProblems(draft, now);
		if (!unitId) return failure('Choose a unit first.');
		if (!leader) return failure('Log in again before saving.');
		if (problems.length > 0) return failure(problems.join(' '));
		try {
			return await this.context.terrain.createEvent(
				unitId,
				eventBody(draft, { unitId, organiserId: leader.id, verifierName: leader.name, timeZone })
			);
		} catch (error) {
			return failure(error instanceof Error ? error.message : String(error));
		}
	}
}

const failure = (body: string): TerrainWriteResult => ({ success: false, status: 0, body });
