// Ported from the C# OASReferenceTests
import { describe, expect, it } from 'vitest';
import {
	checklistText,
	emptyReferenceLink,
	filterStatements,
	parseReferenceLink,
	PARTS,
	referenceLinkToQuery,
	referenceStages,
	referenceStatements,
	stageTitle,
	statementKey,
	streamOfKey,
	type OASReferenceStatement
} from '#lib/model/oas/reference.js';
import { alpineTree, bushwalking3Template } from './fixtures.js';

function bushwalking3(): OASReferenceStatement[] {
	const stage = {
		stream: 'bushwalking',
		streamTitle: 'Bushwalking',
		branch: '',
		branchTitle: '',
		stage: 3,
		templateLink: 'oas/bushwalking/3/latest.json'
	};
	return referenceStatements(stage, bushwalking3Template());
}

describe('OAS reference', () => {
	it('includes every branch of a stream', () => {
		const stages = referenceStages(alpineTree());

		expect(stages.length, 'Stages 1-3 plus four branches from Stage 4 to 9').toBe(27);
		expect(stageTitle(stages[0])).toBe('Alpine Stage 1');
		expect(stages.some((s) => stageTitle(s) === 'Alpine · Snowboarding Stage 7')).toBe(true);
		expect(new Set(stages.map((s) => s.templateLink)).size).toBe(stages.length);
	});

	it('takes statements from verifiable checkboxes, with explanations', () => {
		const list = bushwalking3();

		expect(list.length, 'Logbook and file upload are left out').toBe(17);
		expect(list.every((s) => PARTS.includes(s.part))).toBe(true);
		const navigation = list.find((s) =>
			s.label.startsWith('I have run a small navigational activity')
		)!;
		expect(navigation.detail.startsWith('Activity should take no more than an hour')).toBe(true);
		expect(navigation.theme).toBe('Navigation & Maps');
		expect(navigation.unitNightSuitable).toBe(true);
		expect(
			list.find((s) => s.label.startsWith('I have attended a day bushwalk'))!.unitNightSuitable
		).toBe(false);
	});

	it('filters by search, part and where', () => {
		const list = bushwalking3();

		const compass = filterStatements(list, { search: 'compass' });
		expect(compass.length).toBeGreaterThan(0);
		expect(
			compass.every((s) => (s.label + s.detail).toLowerCase().includes('compass')),
			'Search matches the explanation too'
		).toBe(true);

		expect(filterStatements(list, { part: 'Review' }).length).toBe(2);
		expect(filterStatements(list, { where: 'Outing' }).every((s) => !s.unitNightSuitable)).toBe(
			true
		);
		expect(filterStatements(list, { stages: new Set([4, 5]) }).length).toBe(0);
		expect(
			filterStatements(list, { stages: new Set([2, 3]) }).length,
			'Any selected stage matches'
		).toBe(list.length);
		expect(filterStatements(list, { streams: new Set(['camping']) }).length).toBe(0);
		expect(
			filterStatements(list, { search: 'compass zzzz' }).length,
			'Every search word must match'
		).toBe(0);
	});

	it('has stable keys that filter the starred list', () => {
		const list = bushwalking3();
		const menu = list.find((s) => s.inputId === 'help_plan_bushwalking_balanced_menu_542939')!;

		expect(statementKey(menu)).toBe('bushwalking/3:help_plan_bushwalking_balanced_menu_542939');
		expect(streamOfKey(statementKey(menu))).toBe('bushwalking');
		expect(streamOfKey('alpine/snowboarding/5:abc')).toBe('alpine');
		expect(new Set(list.map(statementKey)).size).toBe(list.length);

		const starred = filterStatements(list, { keys: new Set([statementKey(menu)]) });
		expect(starred.map(statementKey)).toEqual([statementKey(menu)]);
	});

	it('round trips share links', () => {
		const link = {
			...emptyReferenceLink(),
			stream: 'bushwalking',
			stages: [5, 2],
			part: 'Do',
			theme: 'Navigation & Maps',
			where: 'UnitNight' as const,
			search: 'compass bearing',
			starred: true
		};
		const query = referenceLinkToQuery(link);
		expect(query).toBe(
			'?stream=bushwalking&stage=2%2C5&part=Do&theme=Navigation%20%26%20Maps&where=UnitNight&q=compass%20bearing&view=starred'
		);

		const parsed = parseReferenceLink(query);
		expect(parsed.stream).toBe('bushwalking');
		expect(parsed.stages).toEqual([2, 5]);
		expect(parsed.theme).toBe('Navigation & Maps');
		expect(parsed.where).toBe('UnitNight');
		expect(parsed.search).toBe('compass bearing');
		expect(parsed.starred).toBe(true);

		expect(referenceLinkToQuery(emptyReferenceLink())).toBe('');
		expect(parseReferenceLink('?s=bushwalking%2F3%3Aabc&stage=x,0').statement).toBe(
			'bushwalking/3:abc'
		);
		expect(parseReferenceLink('?stage=x,0').stages.length, 'Bad stage numbers are ignored').toBe(0);
	});

	it('groups the checklist text by stage', () => {
		const lines = checklistText(bushwalking3().slice(0, 2), 'Unit night').split('\n');

		expect(lines[0]).toBe('Unit night');
		expect(lines[2]).toBe('Bushwalking Stage 3');
		expect(lines[3].startsWith('☐ I ')).toBe(true);
		expect(lines.length).toBe(5);
	});
});
