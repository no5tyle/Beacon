// Adding activities to a unit's programme, as Terrain's activity planner does.

import { activityProblems, eventBody, isOver, type ActivityDraft } from '#lib/model/activity.js';
import type { TerrainWriteResult } from '#lib/terrain/errors.js';
import type { BeaconContext } from './context.js';

export interface ActivitySaved {
	/** Whether the activity is in the unit's programme */
	success: boolean;
	/** Concluded with its review, rather than left planned */
	concluded: boolean;
	/** Terrain's answer to the step that failed, or "" */
	status: number;
	body: string;
	/** Saved as planned, but concluding it didn't work: done in Terrain instead */
	concludeFailed: boolean;
}

export class ActivitiesService {
	constructor(private readonly context: BeaconContext) {}

	/**
	 * Saves the activity to the unit's programme as the leader, its organiser, as Terrain's own planner
	 * does: planned, then, for one that's over, concluded with its review so those who came get credit
	 */
	async save(
		draft: ActivityDraft,
		unitId: string,
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
		now = new Date()
	): Promise<ActivitySaved> {
		const leader = this.context.profiles?.profiles[0]?.member;
		const problems = activityProblems(draft, now);
		if (!unitId) return failure('Choose a unit first.');
		if (!leader) return failure('Log in again before saving.');
		if (problems.length > 0) return failure(problems.join(' '));
		const context = { unitId, organiserId: leader.id, verifierName: leader.name, timeZone };
		const terrain = this.context.terrain;
		try {
			const planned = await terrain.createEvent(unitId, eventBody(draft, context));
			if (!planned.success) return { ...failure(planned.body), status: planned.status };
			if (!isOver(draft, now)) return saved(false);

			// Concluding needs the new activity's id, from Terrain's answer
			const eventId = idFrom(planned);
			if (!eventId)
				return { ...saved(false), concludeFailed: true, body: "Terrain didn't say its id." };
			const concluded = await terrain.updateEvent(eventId, eventBody(draft, context, 'concluded'));
			return concluded.success
				? saved(true)
				: { ...saved(false), concludeFailed: true, status: concluded.status, body: concluded.body };
		} catch (error) {
			return failure(error instanceof Error ? error.message : String(error));
		}
	}
}

/** The id Terrain gives a new activity, e.g. {"id":"a7720ec4-…"} */
function idFrom(result: TerrainWriteResult): string {
	try {
		const answer = JSON.parse(result.body) as { id?: unknown; event?: { id?: unknown } };
		const id = answer?.id ?? answer?.event?.id;
		return typeof id === 'string' ? id : '';
	} catch {
		return '';
	}
}

const saved = (concluded: boolean): ActivitySaved => ({
	success: true,
	concluded,
	status: 0,
	body: '',
	concludeFailed: false
});

const failure = (body: string): ActivitySaved => ({
	success: false,
	concluded: false,
	status: 0,
	body,
	concludeFailed: false
});
