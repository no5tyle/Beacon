// Ported from the C# OASRecordingTests
import { describe, expect, it } from 'vitest';
import {
	addVerifications,
	allComplete,
	canReceiveCredit,
	createBody,
	isEditable,
	isPreviousStageComplete,
	LOGBOOK_INPUT_ID,
	statements,
	submitBody,
	updateBody,
	type OASRecord,
	type OASVerifier
} from '#lib/model/oas/recording.js';
import type { Answers } from '#lib/model/oas/answers.js';
import { bushwalking3Template } from './fixtures.js';

const FIRST = 'their_help_stage_1_pack_bushwalk_scout_backpack_ed01f4';
const SECOND = 'area_bushwalking_forecast_will_weather_latest_where_8f2cdd';
const VERIFIER: OASVerifier = { type: 'member', name: 'Pat Leader', contact: 'pat@example.com' };
const TODAY = '2026-10-22';

function existingAchievement(): OASRecord {
	return {
		id: 'ach-1',
		member_id: 'youth-1',
		template: 'oas/bushwalking/3',
		version: 2,
		section: 'scout',
		status: 'in_progress',
		last_updated: '2026-10-01T10:00:00.000Z',
		achievement_meta: { stream: 'bushwalking', branch: 'bushwalking', stage: 3 },
		answers: {
			[FIRST]: true,
			[`${FIRST}_verifierName`]: 'Alex Leader',
			[`${FIRST}_verifiedDate`]: '01/10/2026',
			file_uploader: []
		},
		uploads: [{ bucket: 'b', filename: 'map.jpg', key: 'k', uploaded_on: '2026-10-01' }]
	};
}

const answersOf = (record: OASRecord) => record.answers as Answers;

describe('OAS recording', () => {
	it('lists statements from the template with existing answers', () => {
		const list = statements(bushwalking3Template(), answersOf(existingAchievement()));

		expect(list.length, '17 verifiable statements plus the logbook check').toBe(18);
		expect(list.some((s) => s.inputId === 'file_uploader')).toBe(false);
		const first = list.find((s) => s.inputId === FIRST)!;
		expect(first.alreadyDone).toBe(true);
		expect(first.verifiedBy).toBe('Alex Leader');
		expect(first.group).toBe('Plan');
		expect(list.find((s) => s.inputId === LOGBOOK_INPUT_ID)!.isLogbook).toBe(true);
		expect(allComplete(list)).toBe(false);
	});

	it('counts "true" as text as done', () => {
		const list = statements(bushwalking3Template(), { [SECOND]: 'true' });

		expect(list.find((s) => s.inputId === SECOND)!.alreadyDone).toBe(true);
	});

	it('keeps existing answers and adds verifier details', () => {
		const existing = existingAchievement();
		const list = statements(bushwalking3Template(), answersOf(existing));
		const ticked = list.filter((s) => s.inputId === SECOND || s.inputId === FIRST || s.isLogbook);

		const answers = addVerifications(answersOf(existing), ticked, VERIFIER, TODAY);

		// Existing verification untouched
		expect(answers[`${FIRST}_verifierName`]).toBe('Alex Leader');
		expect(answers[`${FIRST}_verifiedDate`]).toBe('01/10/2026');
		expect(answers['file_uploader']).not.toBeUndefined();
		// New verification in Terrain's format
		expect(answers[SECOND]).toBe(true);
		expect(answers[`${SECOND}_verifierType`]).toBe('member');
		expect(answers[`${SECOND}_verifierName`]).toBe('Pat Leader');
		expect(answers[`${SECOND}_verifierContact`]).toBe('pat@example.com');
		expect(answers[`${SECOND}_verifiedDate`]).toBe('22/10/2026');
		// Logbook is a plain checkbox
		expect(answers[LOGBOOK_INPUT_ID]).toBe(true);
		expect(answers[`${LOGBOOK_INPUT_ID}_verifierName`]).toBeUndefined();
		// The original object isn't modified
		expect(answersOf(existing)[SECOND]).toBeUndefined();
	});

	it('update body keeps the record fields', () => {
		const existing = existingAchievement();
		const answers = addVerifications(answersOf(existing), [], VERIFIER, TODAY);

		const body = updateBody(existing, answers);

		expect(body.achievement_type).toBe('outdoor_adventure_skill');
		expect(body.template).toBe('oas/bushwalking/3');
		expect(body.version).toBe(2);
		expect(body.section).toBe('scout');
		expect(body.last_updated).toBe('2026-10-01T10:00:00.000Z');
		expect((body.achievement_meta as { stage: number }).stage).toBe(3);
		expect((body.uploads as { filename: string }[])[0].filename).toBe('map.jpg');
		expect(body.status, "Status isn't sent; Terrain controls it").toBeUndefined();
		expect(body.id).toBeUndefined();
	});

	it("update body leaves out fields the record doesn't have", () => {
		// An older Joey record, as Terrain returns it: no last_updated and no uploads
		const existing = existingAchievement();
		delete existing.last_updated;
		delete existing.uploads;

		const body = updateBody(existing, {});

		expect('last_updated' in body, 'Sending last_updated as null gets the save turned away').toBe(
			false
		);
		expect(body.uploads).toEqual([]);
		expect(
			Object.values(body).some((value) => value === null),
			'No field is sent as null'
		).toBe(false);
	});

	it('create body matches Terrain', () => {
		const stage = {
			stream: 'Bushwalking',
			branch: 'bushwalking',
			stage: 3,
			stageTitle: '',
			templateLink: '',
			selectListItemText: ''
		};
		const list = statements(bushwalking3Template(), null);
		const answers = addVerifications(null, list.slice(0, 1), VERIFIER, TODAY);

		const body = createBody(bushwalking3Template(), stage, 'scout', answers);

		expect(body.achievement_meta).toEqual({
			stage: 3,
			stream: 'bushwalking',
			branch: 'bushwalking'
		});
		expect(body.template).toBe('oas/bushwalking/3');
		expect(body.version).toBe(2);
		expect(body.uploads).toEqual([]);
		expect(body.last_updated).toBeUndefined();
		expect(answersOf(body)[FIRST]).toBe(true);
	});

	it('submit body is a review on behalf of the youth', () => {
		expect(JSON.stringify(submitBody('unit-1', 'leader-1'))).toBe(
			'{"type":"review","unit_id":"unit-1","submitted_by":"leader-1"}'
		);
	});

	it('follows the stage rules', () => {
		expect(canReceiveCredit(3, [])).toBe(true);
		expect(canReceiveCredit(4, [2, 3])).toBe(false);
		expect(canReceiveCredit(4, [1])).toBe(true);
		expect(isPreviousStageComplete(1, [])).toBe(true);
		expect(isPreviousStageComplete(3, [1])).toBe(false);
		expect(isEditable('')).toBe(true);
		expect(isEditable('in_progress')).toBe(true);
		expect(isEditable('feedback_review')).toBe(true);
		expect(isEditable('pending_review')).toBe(false);
		expect(isEditable('awarded')).toBe(false);
	});
});
