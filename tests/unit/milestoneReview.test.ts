import { describe, expect, it } from 'vitest';
import {
	milestoneReviewBody,
	milestoneToSubmit,
	requirementsComplete
} from '#lib/model/oas/milestoneReview.js';
import type { TerrainAchievement } from '#lib/terrain/types.js';

// Shaped as Terrain's record for a Cub's Milestone 1 with every participate and lead done
const record = (extra: Partial<TerrainAchievement> = {}): TerrainAchievement => ({
	id: 'm1',
	member_id: 'youth-1',
	section: 'cub',
	type: 'milestone',
	status: 'in_progress',
	milestone_requirement_status: 'complete',
	achievement_meta: { stage: 1 },
	event_log: [
		{ credit_type: 'participant', challenge_area: 'outdoors', event_id: 'e1' },
		{ credit_type: 'leader', challenge_area: 'personal_growth', event_id: 'e2' },
		{ credit_type: 'leader', challenge_area: 'personal_growth', event_id: 'e3' },
		{ credit_type: 'assistant', challenge_area: 'community', event_id: 'e4' }
	],
	...extra
});

describe('submitting a milestone', () => {
	it('reviews each lead, against the review template, as Terrain sends it', () => {
		expect(
			milestoneReviewBody(record(), { template: 'milestone/cub/review/1', version: 3 })
		).toEqual({
			achievement_type: 'milestone',
			template: 'milestone/cub/review/1',
			version: 3,
			section: 'cub',
			answers: {
				leader_review_e2: ' ',
				leader_review_e3: ' ',
				leader_review_e4: ' ',
				supporting_files: []
			},
			uploads: [],
			reset_to_draft: false
		});
	});

	it("keeps a leader's review already written", () => {
		const body = milestoneReviewBody(
			record({ status: 'draft_review', answers: { leader_review_e2: 'Ran it well' } }),
			{ template: 'milestone/cub/review/1', version: 3 }
		);
		expect((body.answers as Record<string, unknown>).leader_review_e2).toBe('Ran it well');
	});

	it("finds the section's record for the milestone while it can still be submitted", () => {
		const joey = record({ id: 'j1', section: 'joey' });
		expect(milestoneToSubmit([joey, record()], 'cub', 1)?.id).toBe('m1');
		expect(milestoneToSubmit([record({ status: 'pending_review' })], 'cub', 1)).toBeNull();
		expect(milestoneToSubmit([record()], 'cub', 2)).toBeNull();
	});

	it("goes by Terrain's own flag for whether the activities are done", () => {
		expect(requirementsComplete(record())).toBe(true);
		expect(requirementsComplete(record({ milestone_requirement_status: 'incomplete' }))).toBe(
			false
		);
		expect(requirementsComplete(record({ milestone_requirement_status: undefined }))).toBe(true);
	});
});
