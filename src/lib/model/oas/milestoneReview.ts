// Submitting a milestone for the Unit Council's review on a youth's behalf, as Terrain's own Milestones
// page does: each lead (or assist, which now counts as a lead) gets a leader review answer, saved to the
// youth's record against the milestone's review template, then the record is submitted.

import type { TerrainAchievement } from '#lib/terrain/types.js';
import { isEditable } from './recording.js';

/** Activity credits Terrain asks a leader to review */
const LEAD_CREDITS = ['leader', 'assistant'];

/** Terrain's answer for a reviewed lead: a blank comment, as its page sends */
const REVIEWED = ' ';

interface MilestoneEvent {
	credit_type?: string;
	event_id?: string;
}

/** The youth's record for a milestone in a section, if it can still be submitted */
export function milestoneToSubmit(
	records: readonly TerrainAchievement[],
	section: string,
	stage: number
): TerrainAchievement | null {
	return (
		records.find(
			(r) =>
				r.type === 'milestone' &&
				r.section === section &&
				r.achievement_meta?.stage === stage &&
				isEditable(r.status)
		) ?? null
	);
}

/** Whether Terrain itself counts the milestone's participates and leads as done, where it says */
export const requirementsComplete = (record: TerrainAchievement) =>
	record.milestone_requirement_status === undefined ||
	record.milestone_requirement_status === 'complete';

/**
 * Body for PUT members/{id}/achievements/{milestoneId}: the record's answers, with a review for every lead
 * not reviewed yet, against the review template (e.g. "milestone/cub/review/1", version 3)
 */
export function milestoneReviewBody(
	record: TerrainAchievement,
	template: { template: string; version: number }
): Record<string, unknown> {
	const answers: Record<string, unknown> = { ...(record.answers ?? {}) };
	for (const event of (record.event_log ?? []) as MilestoneEvent[])
		if (event.event_id && LEAD_CREDITS.includes(event.credit_type ?? ''))
			answers[`leader_review_${event.event_id}`] ??= REVIEWED;
	answers.supporting_files ??= [];
	return {
		achievement_type: 'milestone',
		template: template.template,
		version: template.version,
		section: record.section,
		answers,
		uploads: Array.isArray(record.uploads) ? record.uploads : [],
		reset_to_draft: false
	};
}
