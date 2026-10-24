// One OAS stage looked at closely: which of its statements to programme first. Only youth for whom it is
// the next stage in the stream count, i.e. it is one above the highest stage they've completed.

import { isTrue } from '../oas/answers.js';
import { isEditable, LOGBOOK_INPUT_ID, VERIFIABLE_CHECKBOX } from '../oas/recording.js';
import type { UnitOASRecord } from '../oas/signOff.js';
import type { OASTemplate } from '../oas/templates.js';
import { distinct, sortBy, asc, desc } from '../util.js';
import { classify, isUnitNightSuitable } from './skillThemes.js';

export interface StageStatement {
	inputId: string;
	/** Plan, Do, Review or Verify */
	group: string;
	label: string;
	detail: string;
	isLogbook: boolean;
	theme: string;
	unitNightSuitable: boolean;
	/** Position in the template, to keep Terrain's order when scores tie */
	order: number;
}

export type Priority = '' | 'moving up' | 'focus';

export interface StageCandidate {
	memberId: string;
	name: string;
	patrol: string;
	/** Moving up soon, or picked as a focus youth on Insights */
	priority: Priority;
}

export interface StageYouth extends StageCandidate {
	/** They have a record for the stage in Terrain */
	started: boolean;
	/** Submitted for review, or otherwise can't be changed, so nothing is needed from a leader */
	submitted: boolean;
	/** Statements they still need, in template order */
	remaining: string[];
}

export interface StatementPriority {
	statement: StageStatement;
	/** Youth still needing it */
	neededBy: string[];
	startedNeeding: string[];
	priorityNeeding: string[];
	/** Youth for whom it is the only statement left */
	lastFor: string[];
	/** Youth for whom it is one of the last two */
	secondLastFor: string[];
	score: number;
}

export interface ThemeGroup {
	theme: string;
	statements: string[];
	neededBy: string[];
	/** Youth an activity on this theme would finish the stage for: everything they have left is in it */
	finishesFor: string[];
}

export interface StageAnalysis {
	youth: StageYouth[];
	/** Youth still working towards the stage, i.e. not submitted */
	workingTowards: number;
	started: number;
	submitted: number;
	/** One or two statements from finishing */
	nearlyDone: number;
	statements: StatementPriority[];
	themes: ThemeGroup[];
}

/** The stage's "I" statements and the logbook check, as Record OAS lists them */
export function stageStatements(template: OASTemplate): StageStatement[] {
	const result: StageStatement[] = [];
	for (const document of template.document) {
		for (const group of document.input_groups) {
			const part = group.title.replaceAll('>', '').trim();
			for (const input of group.inputs) {
				if (input.type !== VERIFIABLE_CHECKBOX && input.id !== LOGBOOK_INPUT_ID) continue;
				const label = input.label ?? '';
				result.push({
					inputId: input.id,
					group: part,
					label,
					detail: (input.dialog_text ?? '').trim(),
					isLogbook: input.id === LOGBOOK_INPUT_ID,
					theme: classify(part, label),
					unitNightSuitable: isUnitNightSuitable(part, label),
					order: result.length
				});
			}
		}
	}
	return result;
}

/**
 * How much each statement is worth programming: everyone who needs it counts once, youth who have started
 * the stage and priority youth count twice more, and finishing the stage counts most.
 */
export const SCORE = {
	needed: 1,
	started: 2,
	priority: 2,
	last: 3,
	secondLast: 1.5
};

export function analyseStage(
	statements: readonly StageStatement[],
	candidates: readonly StageCandidate[],
	records: ReadonlyMap<string, UnitOASRecord>
): StageAnalysis {
	const youth: StageYouth[] = candidates.map((candidate) => {
		const record = records.get(candidate.memberId);
		const submitted = record != null && !isEditable(record.status);
		return {
			...candidate,
			started: record != null,
			submitted,
			remaining: submitted
				? []
				: statements.filter((s) => !isTrue(record?.answers?.[s.inputId])).map((s) => s.inputId)
		};
	});
	const working = youth.filter((y) => !y.submitted && y.remaining.length > 0);

	const priorities = statements.map((statement): StatementPriority => {
		const needing = working.filter((y) => y.remaining.includes(statement.inputId));
		const ids = (list: StageYouth[]) => list.map((y) => y.memberId);
		const neededBy = ids(needing);
		const startedNeeding = ids(needing.filter((y) => y.started));
		const priorityNeeding = ids(needing.filter((y) => y.priority !== ''));
		const lastFor = ids(needing.filter((y) => y.remaining.length === 1));
		const secondLastFor = ids(needing.filter((y) => y.remaining.length === 2));
		return {
			statement,
			neededBy,
			startedNeeding,
			priorityNeeding,
			lastFor,
			secondLastFor,
			score:
				SCORE.needed * neededBy.length +
				SCORE.started * startedNeeding.length +
				SCORE.priority * priorityNeeding.length +
				SCORE.last * lastFor.length +
				SCORE.secondLast * secondLastFor.length
		};
	});

	const themes = distinct(statements.map((s) => s.theme)).map((theme): ThemeGroup => {
		const inTheme = statements.filter((s) => s.theme === theme).map((s) => s.inputId);
		const needing = working.filter((y) => y.remaining.some((id) => inTheme.includes(id)));
		return {
			theme,
			statements: inTheme,
			neededBy: needing.map((y) => y.memberId),
			finishesFor: needing
				.filter((y) => y.remaining.every((id) => inTheme.includes(id)))
				.map((y) => y.memberId)
		};
	});

	return {
		youth,
		workingTowards: youth.filter((y) => !y.submitted).length,
		started: youth.filter((y) => y.started && !y.submitted).length,
		submitted: youth.filter((y) => y.submitted).length,
		nearlyDone: working.filter((y) => y.remaining.length <= 2).length,
		// Most worth doing first; ties go to what can be done at a unit night, then Terrain's order
		statements: sortBy(
			priorities.filter((p) => p.neededBy.length > 0),
			desc((p) => p.score),
			desc((p) => p.statement.unitNightSuitable),
			asc((p) => p.statement.order)
		),
		themes: sortBy(
			themes.filter((t) => t.neededBy.length > 0),
			desc((t) => t.finishesFor.length),
			desc((t) => t.neededBy.length),
			asc((t) => t.theme)
		)
	};
}
