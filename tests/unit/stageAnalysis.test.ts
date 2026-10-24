import { describe, expect, it } from 'vitest';
import {
	analyseStage,
	stageStatements,
	type StageCandidate
} from '#lib/model/insights/stageAnalysis.js';
import type { UnitOASRecord } from '#lib/model/oas/signOff.js';
import type { OASTemplate } from '#lib/model/oas/templates.js';

const template: OASTemplate = {
	template: 'oas/camping/3',
	meta: { stage: 3, stream: 'camping' },
	version: 1,
	document: [
		{
			title: 'Stage 3 - Camping',
			input_groups: [
				{
					title: 'Plan>',
					inputs: [
						{ id: 'menu', type: 'verifiable_checkbox', label: 'I can plan a menu for a camp.' },
						{ id: 'notes', type: 'text_field', label: 'Notes' }
					]
				},
				{
					title: 'Do>',
					inputs: [
						{
							id: 'knots',
							type: 'verifiable_checkbox',
							label: 'I can tie a reef knot and a clove hitch.',
							dialog_text: ' Both knots, without help. '
						},
						{ id: 'tent', type: 'verifiable_checkbox', label: 'I can pitch a tent.' }
					]
				},
				{
					title: 'Review>',
					inputs: [
						{ id: 'logbook_up_to_date', type: 'checkbox', label: 'My logbook is up to date.' }
					]
				}
			]
		}
	]
};

const statements = stageStatements(template);
const ALL = ['menu', 'knots', 'tent', 'logbook_up_to_date'];

const candidate = (
	memberId: string,
	priority: StageCandidate['priority'] = ''
): StageCandidate => ({
	memberId,
	name: memberId.toUpperCase(),
	patrol: 'Kookaburra',
	priority
});

const record = (memberId: string, status: string, done: string[]): UnitOASRecord => ({
	id: `rec-${memberId}`,
	member_id: memberId,
	status,
	achievement_meta: { stream: 'camping', branch: 'camping', stage: 3 },
	answers: Object.fromEntries(done.map((id) => [id, true]))
});

describe('stage analysis', () => {
	it('lists the statements and logbook check from the template, leaving other inputs out', () => {
		expect(statements.map((s) => s.inputId)).toEqual(ALL);
		expect(statements[1]).toMatchObject({
			group: 'Do',
			detail: 'Both knots, without help.',
			isLogbook: false,
			order: 1
		});
		expect(statements[3].isLogbook).toBe(true);
	});

	it('counts who still needs each statement, and who has started or submitted the stage', () => {
		const records = new Map([
			['a', record('a', 'in_progress', ['menu', 'knots'])],
			['b', record('b', 'pending_review', ALL)]
		]);
		const analysis = analyseStage(
			statements,
			[candidate('a'), candidate('b'), candidate('c')],
			records
		);

		expect(analysis.youth.map((y) => [y.memberId, y.started, y.submitted, y.remaining])).toEqual([
			['a', true, false, ['tent', 'logbook_up_to_date']],
			['b', true, true, []],
			['c', false, false, ALL]
		]);
		expect(analysis).toMatchObject({ workingTowards: 2, started: 1, submitted: 1, nearlyDone: 1 });
		const tent = analysis.statements.find((p) => p.statement.inputId === 'tent')!;
		expect(tent).toMatchObject({
			neededBy: ['a', 'c'],
			startedNeeding: ['a'],
			secondLastFor: ['a'],
			lastFor: []
		});
		// Nobody needs the menu but c, and nobody at all is left out because they submitted
		expect(analysis.statements.find((p) => p.statement.inputId === 'menu')!.neededBy).toEqual([
			'c'
		]);
	});

	it('puts statements that finish the stage, and those priority youth need, first', () => {
		const records = new Map([
			['a', record('a', 'in_progress', ['menu', 'tent', 'logbook_up_to_date'])],
			['b', record('b', 'in_progress', ['menu', 'tent', 'logbook_up_to_date'])]
		]);
		const analysis = analyseStage(
			statements,
			[candidate('a'), candidate('b'), candidate('c', 'moving up'), candidate('d'), candidate('e')],
			records
		);

		// knots: 5 needing + 2 started + 1 priority + 2 finishing = 5 + 4 + 2 + 6 = 17
		expect(analysis.statements[0].statement.inputId).toBe('knots');
		expect(analysis.statements[0].score).toBe(17);
		expect(analysis.statements[0].lastFor).toEqual(['a', 'b']);
		// Everything else is needed by c, d and e only: 3 + 2 for c moving up = 5; ties keep Terrain's order
		expect(analysis.statements.slice(1).map((p) => [p.statement.inputId, p.score])).toEqual([
			['menu', 5],
			['tent', 5],
			['logbook_up_to_date', 5]
		]);
	});

	it('breaks ties in favour of what can be done at a unit night', () => {
		const outing = stageStatements({
			...template,
			document: [
				{
					title: 'Stage 3',
					input_groups: [
						{
							title: 'Do>',
							inputs: [
								{
									id: 'hike',
									type: 'verifiable_checkbox',
									label: 'I can lead a day hike on a trail.'
								},
								{ id: 'knots', type: 'verifiable_checkbox', label: 'I can tie a reef knot.' }
							]
						}
					]
				}
			]
		});
		expect(outing.map((s) => s.unitNightSuitable)).toEqual([false, true]);
		const analysis = analyseStage(outing, [candidate('a')], new Map());
		expect(analysis.statements.map((p) => p.statement.inputId)).toEqual(['knots', 'hike']);
	});

	it('groups by theme, and says who one activity on it would finish the stage for', () => {
		const records = new Map([['a', record('a', 'in_progress', ['menu', 'logbook_up_to_date'])]]);
		const analysis = analyseStage(statements, [candidate('a'), candidate('b')], records);
		const knotsTheme = statements.find((s) => s.inputId === 'knots')!.theme;
		const group = analysis.themes.find((t) => t.statements.includes('knots'))!;
		expect(group.theme).toBe(knotsTheme);
		expect(group.neededBy).toEqual(['a', 'b']);
		// a only has knots and the tent left; they finish only if both are in this theme
		const sameTheme = statements.find((s) => s.inputId === 'tent')!.theme === knotsTheme;
		expect(group.finishesFor).toEqual(sameTheme ? ['a'] : []);
	});

	it('leaves out statements nobody needs', () => {
		const records = new Map([['a', record('a', 'in_progress', ['menu'])]]);
		const analysis = analyseStage(statements, [candidate('a')], records);
		expect(analysis.statements.map((p) => p.statement.inputId)).not.toContain('menu');
		expect(analyseStage(statements, [], new Map()).statements).toEqual([]);
	});
});
