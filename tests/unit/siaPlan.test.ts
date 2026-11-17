import { describe, expect, it } from 'vitest';
import {
	answersOf,
	createPlanBody,
	isPlanEditable,
	isReviewEditable,
	reviewInputs,
	missingRequired,
	planAnswers,
	planInputs,
	submitPlanBody,
	templatePart,
	updatePlanBody,
	type SIARecord,
	type SIATemplate
} from '#lib/model/siaPlan.js';
import { readJson } from './fixtures.js';

// Terrain's Cub plan template, as captured
const template = readJson<SIATemplate>('../fixtures/sia-cub-plan.json');

// A Cub's plan as Terrain returned it (ids changed)
const saved: SIARecord = {
	id: 'plan-1',
	member_id: 'cub-1',
	template: 'sia/cub/plan',
	version: 2,
	section: 'cub',
	type: 'special_interest_area',
	answers: {
		project_name: 'Learning another language',
		special_interest_area_selection: 'sia_growth_development'
	},
	status: 'draft_approval',
	last_updated: '2026-11-17T11:42:19.574002+00:00'
};

describe('an SIA plan', () => {
	it('asks the template’s questions, the area and project name required', () => {
		expect(planInputs(template).map((i) => i.id)).toEqual([
			'special_interest_area_selection',
			'project_name',
			'want_to_achieve',
			'step_1',
			'step_2',
			'step_3',
			'share_with_unit',
			'who_is_involved',
			'who_is_helping'
		]);
		expect(missingRequired(template, {})).toEqual([
			'Pick the Special Interest Area',
			'Name your project'
		]);
		expect(missingRequired(template, answersOf(saved))).toEqual([]);
	});

	it('splits the template into its required questions and its optional ones', () => {
		const ids = (pages: SIATemplate['document']) =>
			pages.map((p) => [p.title, p.input_groups.flatMap((g) => g.inputs.map((i) => i.id))]);
		expect(ids(templatePart(template, true))).toEqual([
			['Project Details', ['special_interest_area_selection', 'project_name']]
		]);
		expect(ids(templatePart(template, false))).toEqual([
			['Goals', ['want_to_achieve']],
			['How', ['step_1', 'step_2', 'step_3', 'share_with_unit']],
			['Who', ['who_is_involved', 'who_is_helping']]
		]);
	});

	it('saves exactly what Terrain sends, leaving out questions not answered', () => {
		const answers = planAnswers(saved.answers, {
			...answersOf(saved),
			step_1: '  ',
			want_to_achieve: ''
		});
		// Terrain's own save of this plan
		expect(JSON.stringify(updatePlanBody(saved, answers))).toBe(
			'{"achievement_type":"special_interest_area","template":"sia/cub/plan","version":2,"section":"cub","answers":{"project_name":"Learning another language","special_interest_area_selection":"sia_growth_development"},"uploads":[],"reset_to_draft":false}'
		);
	});

	it('keeps answers Beacon doesn’t edit, such as attached documents', () => {
		expect(planAnswers({ attach_documentation: [], step_1: 'Old' }, { step_1: 'New' })).toEqual({
			attach_documentation: [],
			step_1: 'New'
		});
	});

	it('starts a plan with the template and answers, and submits it for approval', () => {
		// Terrain's own start of a new plan
		const answers = planAnswers(
			{},
			{
				special_interest_area_selection: 'sia_art_literature',
				project_name: 'Creating a comic book'
			}
		);
		expect(JSON.stringify(createPlanBody(template, 'cub', answers))).toBe(
			'{"achievement_type":"special_interest_area","template":"sia/cub/plan","version":2,"section":"cub","answers":{"special_interest_area_selection":"sia_art_literature","project_name":"Creating a comic book"},"uploads":[]}'
		);
		// Terrain's own submit
		expect(JSON.stringify(submitPlanBody('unit-1', 'leader-1'))).toBe(
			'{"type":"approval","unit_id":"unit-1","submitted_by":"leader-1"}'
		);
	});

	it('can be changed only while it’s a plan not yet submitted', () => {
		expect(isPlanEditable(saved)).toBe(true);
		expect(isPlanEditable({ ...saved, status: 'pending_approval' })).toBe(false);
		expect(isPlanEditable({ ...saved, status: 'draft_review' })).toBe(false);
	});

	it('reviews an approved plan on the same record, its questions all optional, and submits it for review', () => {
		const review = readJson<SIATemplate>('../fixtures/sia-cub-review.json');
		// Attaching files is left to Terrain
		expect(reviewInputs(review).map((i) => i.id)).toEqual([
			'important_learned',
			'hardest_part',
			'what_did_you_enjoy_about_your_project',
			'what_ways_have_you_developed_by_doing_project',
			'continue_extend_SIA'
		]);
		expect(missingRequired(review, {})).toEqual([]);
		const approved: SIARecord = {
			...saved,
			status: 'draft_review',
			answers: { attach_documentation: [], ...saved.answers }
		};
		expect(isReviewEditable(approved)).toBe(true);
		expect(isPlanEditable(approved)).toBe(false);
		expect(isReviewEditable({ ...approved, status: 'pending_review' })).toBe(false);
		// Saved as Terrain saves it: the plan's template, the attached documents kept
		expect(
			updatePlanBody(approved, planAnswers(approved.answers, { important_learned: ' ' }))
		).toMatchObject({
			template: 'sia/cub/plan',
			answers: { attach_documentation: [] },
			reset_to_draft: false
		});
		// Terrain's own submit of a review
		expect(JSON.stringify(submitPlanBody('unit-1', 'leader-1', 'review'))).toBe(
			'{"type":"review","unit_id":"unit-1","submitted_by":"leader-1"}'
		);
	});
});
