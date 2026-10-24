// Builds the request bodies Terrain's own web app sends when a leader records OAS "I" statements
// on a youth member's behalf. Existing answers are never removed or changed, only added to.
// Ported from Beacon's C# OASRecording; tests compare its output with the C# version's.

import { dayMonthYear, type CalendarDate } from '../dates.js';
import { answerText, isTrue, type Answers } from './answers.js';
import type { OASStage, OASTemplate } from './templates.js';

export const ACHIEVEMENT_TYPE = 'outdoor_adventure_skill';
export const VERIFIABLE_CHECKBOX = 'verifiable_checkbox';
export const LOGBOOK_INPUT_ID = 'logbook_up_to_date';
export const VERIFIER_TYPE_MEMBER = 'member';
export const SUBMIT_TYPE_REVIEW = 'review';

/** Adult leaders can't verify Stage 6 and above (Terrain's verifier dialog) */
export const MAX_LEADER_VERIFIABLE_STAGE = 5;

const VERIFIED_DATE_SUFFIX = '_verifiedDate';
const VERIFIER_NAME_SUFFIX = '_verifierName';
const VERIFIER_TYPE_SUFFIX = '_verifierType';
const VERIFIER_CONTACT_SUFFIX = '_verifierContact';

/** Statuses where the youth (or a leader on their behalf) can still change answers */
const EDITABLE_STATUSES = ['in_progress', 'draft_review', 'feedback_review'];

export interface OASStatement {
	inputId: string;
	group: string;
	label: string;
	isLogbook: boolean;
	alreadyDone: boolean;
	verifiedBy: string;
	verifiedDate: string;
}

export interface OASVerifier {
	type: string;
	name: string;
	contact: string;
}

/** A Terrain OAS record (achievement) as Terrain returns it */
export type OASRecord = Record<string, unknown>;

export function isEditable(status: string | null | undefined): boolean {
	return !status || EDITABLE_STATUSES.includes(status);
}

/** A stage's statements, and the logbook check, with whether each is already done */
export function statements(template: OASTemplate, answers: Answers | null): OASStatement[] {
	const result: OASStatement[] = [];
	for (const document of template.document) {
		for (const group of document.input_groups) {
			for (const input of group.inputs.filter(
				(i) => i.type === VERIFIABLE_CHECKBOX || i.id === LOGBOOK_INPUT_ID
			)) {
				result.push({
					inputId: input.id,
					group: group.title.replaceAll('>', '').trim(),
					label: input.label,
					isLogbook: input.id === LOGBOOK_INPUT_ID,
					alreadyDone: isTrue(answers?.[input.id]),
					verifiedBy: answerText(answers?.[input.id + VERIFIER_NAME_SUFFIX]),
					verifiedDate: answerText(answers?.[input.id + VERIFIED_DATE_SUFFIX])
				});
			}
		}
	}
	return result;
}

/** Answers for the save: a copy of the existing answers plus each newly ticked statement */
export function addVerifications(
	existingAnswers: Answers | null,
	newlyTicked: OASStatement[],
	verifier: OASVerifier,
	verifiedOn: CalendarDate
): Answers {
	const answers: Answers = existingAnswers === null ? {} : structuredClone(existingAnswers);
	for (const statement of newlyTicked.filter((s) => !s.alreadyDone)) {
		answers[statement.inputId] = true;
		if (statement.isLogbook) continue;
		answers[statement.inputId + VERIFIER_TYPE_SUFFIX] = verifier.type;
		answers[statement.inputId + VERIFIER_NAME_SUFFIX] = verifier.name;
		answers[statement.inputId + VERIFIER_CONTACT_SUFFIX] = verifier.contact;
		answers[statement.inputId + VERIFIED_DATE_SUFFIX] = dayMonthYear(verifiedOn);
	}
	return answers;
}

/** Body for POST members/{id}/achievements when the youth hasn't started this stage */
export function createBody(
	template: OASTemplate,
	stage: OASStage,
	section: string,
	answers: Answers
): OASRecord {
	return {
		achievement_meta: {
			stage: stage.stage,
			stream: stage.stream.toLowerCase(),
			branch: stage.branch
		},
		achievement_type: ACHIEVEMENT_TYPE,
		template: template.template,
		version: template.version,
		section,
		answers,
		uploads: []
	};
}

/**
 * Body for PUT members/{id}/achievements/{achievementId}, keeping the record's own template,
 * version, section, uploads and last_updated so nothing else on it changes.
 * Fields the record doesn't have are left out rather than sent as null: older records, such as Joey
 * records ticked through events, have no last_updated, and Terrain turns away a save that sends it as null.
 */
export function updateBody(existing: OASRecord, answers: Answers): OASRecord {
	const body: OASRecord = {
		achievement_type: ACHIEVEMENT_TYPE,
		answers,
		uploads: existing.uploads != null ? structuredClone(existing.uploads) : []
	};
	for (const field of ['achievement_meta', 'template', 'version', 'section', 'last_updated']) {
		if (existing[field] != null) body[field] = structuredClone(existing[field]);
	}
	return body;
}

export function submitBody(unitId: string, submittedByMemberId: string): OASRecord {
	return { type: SUBMIT_TYPE_REVIEW, unit_id: unitId, submitted_by: submittedByMemberId };
}

export function allComplete(list: OASStatement[]): boolean {
	return list.every((s) => s.alreadyDone);
}

/** Terrain only lets Stages 4+ earn credit once the stage three below is complete in the same stream */
export function canReceiveCredit(
	stage: number,
	completedStagesInStream: readonly number[]
): boolean {
	return stage <= 3 || completedStagesInStream.includes(stage - 3);
}

export function isPreviousStageComplete(
	stage: number,
	completedStagesInStream: readonly number[]
): boolean {
	return stage === 1 || completedStagesInStream.includes(stage - 1);
}
