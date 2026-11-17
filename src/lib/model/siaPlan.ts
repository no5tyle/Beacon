// A special interest area plan, as Terrain's own pages enter one: the questions come from Terrain's plan
// template (sia/{section}/plan), the answers are saved to the youth's record, and the plan is then
// submitted for the Unit Council's approval. The bodies follow Terrain's own requests.

/** The six areas, as Terrain names them in a plan's special_interest_area_selection */
export const SIA_AREAS = [
	{ id: 'sia_adventure_sport', name: 'Adventure & Sport' },
	{ id: 'sia_art_literature', name: 'Arts & Literature' },
	{ id: 'sia_environment', name: 'Environment' },
	{ id: 'sia_stem_innovation', name: 'STEM & Innovation' },
	{ id: 'sia_growth_development', name: 'Growth & Development' },
	{ id: 'sia_better_world', name: 'Creating a Better World' }
] as const;

export const siaAreaName = (id: string) => SIA_AREAS.find((a) => a.id === id)?.name ?? '';

export const SIA_TYPE = 'special_interest_area';
export const AREA_INPUT = 'special_interest_area_selection';
export const PROJECT_NAME_INPUT = 'project_name';

/** One question on Terrain's plan, e.g. a text input, a choice of area, or a radio choice */
export interface SIAInput {
	id: string;
	type: string;
	label: string;
	/** "required" for questions the plan can't be saved without */
	rules?: string;
	/** A hint, e.g. "e.g. My Goal is..." */
	alt?: string;
	selections?: { id: string; title: string }[];
}

export interface SIAInputGroup {
	title?: string;
	inputs: SIAInput[];
}

/** Terrain's plan template, e.g. sia/cub/plan version 2: pages of grouped questions */
export interface SIATemplate {
	template: string;
	version: number;
	document: { title: string; input_groups: SIAInputGroup[] }[];
}

/** A youth's SIA record as Terrain returns it */
export type SIARecord = Record<string, unknown> & {
	id: string;
	status: string;
	template?: string;
	version?: number;
	section?: string;
	answers?: Record<string, unknown>;
	last_updated?: string | null;
};

export type SIAAnswers = Record<string, string>;

/** Every question on the plan, in order */
export const planInputs = (template: SIATemplate): SIAInput[] =>
	template.document.flatMap((page) => page.input_groups.flatMap((group) => group.inputs));

export const isRequired = (input: SIAInput) => input.rules === 'required';

/** The plan's text answers from a record, for the form */
export function answersOf(record: SIARecord | null): SIAAnswers {
	const answers: SIAAnswers = {};
	for (const [key, value] of Object.entries(record?.answers ?? {}))
		if (typeof value === 'string') answers[key] = value;
	return answers;
}

/** Labels of required questions still unanswered, without Terrain's trailing "*" */
export function missingRequired(template: SIATemplate, answers: SIAAnswers): string[] {
	return planInputs(template)
		.filter((input) => isRequired(input) && !answers[input.id]?.trim())
		.map((input) => input.label.replace(/\*$/, ''));
}

/**
 * The answers to send: what the record already has (e.g. attached documents, which Beacon doesn't edit),
 * with the form's text answers over it. Unanswered questions are left out, as Terrain's page leaves them
 */
export function planAnswers(
	existing: Record<string, unknown> | undefined,
	answers: SIAAnswers
): Record<string, unknown> {
	const merged: Record<string, unknown> = structuredClone(existing ?? {});
	for (const [key, value] of Object.entries(answers)) {
		const text = value.trim();
		if (text) merged[key] = text;
		else delete merged[key];
	}
	return merged;
}

/**
 * Body for POST members/{id}/achievements, starting a youth's plan, exactly as Terrain sends it: e.g.
 * {"achievement_type":"special_interest_area","template":"sia/cub/plan","version":2,"section":"cub",
 * "answers":{...},"uploads":[]}. Terrain answers with the new record, status draft_approval
 */
export function createPlanBody(
	template: Pick<SIATemplate, 'template' | 'version'>,
	section: string,
	answers: Record<string, unknown>
) {
	return {
		achievement_type: SIA_TYPE,
		template: template.template,
		version: template.version,
		section,
		answers,
		uploads: []
	};
}

/**
 * Body for PUT members/{id}/achievements/{id}, saving a plan, exactly as Terrain sends it: e.g.
 * {"achievement_type":"special_interest_area","template":"sia/cub/plan","version":2,"section":"cub",
 * "answers":{...},"uploads":[],"reset_to_draft":false}
 */
export function updatePlanBody(record: SIARecord, answers: Record<string, unknown>) {
	return {
		achievement_type: SIA_TYPE,
		template: record.template,
		version: record.version,
		section: record.section,
		answers,
		uploads: Array.isArray(record.uploads) ? structuredClone(record.uploads) : [],
		reset_to_draft: false
	};
}

/** Body for POST .../submit-on-behalf, submitting a plan for the Unit Council's approval */
export const submitPlanBody = (unitId: string, submittedBy: string) => ({
	type: 'approval',
	unit_id: unitId,
	submitted_by: submittedBy
});

/** A plan still being written: saved but not submitted, or sent back by the Unit Council */
export const isPlanEditable = (record: SIARecord) =>
	/\/plan$/.test(record.template ?? '') &&
	['draft_approval', 'feedback_approval'].includes(record.status);

/** How a project stands, e.g. "Plan waiting for approval" */
export function siaStatusDisplay(record: SIARecord): string {
	switch (record.status) {
		case 'draft_approval':
			return 'Plan in progress';
		case 'feedback_approval':
			return 'Plan needs changes';
		case 'pending_approval':
			return 'Plan waiting for approval';
		case 'draft_review':
		case 'in_progress':
			return 'Plan approved, review to do';
		case 'feedback_review':
			return 'Review needs changes';
		case 'pending_review':
			return 'Review waiting for approval';
		case 'awarded':
			return 'Complete';
		default:
			return record.status.replaceAll('_', ' ');
	}
}

export const projectName = (record: SIARecord) =>
	String(record.answers?.[PROJECT_NAME_INPUT] ?? '') || 'Unnamed project';
