// The Svelte port gives exactly the same results as the Blazor app, for the inputs saved in tests/golden
import { describe, expect, it } from 'vitest';
import { buildInsights, stagesForDetail } from '#lib/model/insights/insightsCalculator.js';
import { buildMemberInsights } from '#lib/model/insights/memberInsightsCalculator.js';
import type { OASRequirementStatus, YouthRecord } from '#lib/model/insights/models.js';
import type { InsightsSettings, SectionRules } from '#lib/model/insights/settings.js';
import type { Answers } from '#lib/model/oas/answers.js';
import {
	addVerifications,
	createBody,
	statements,
	submitBody,
	updateBody,
	type OASRecord,
	type OASVerifier
} from '#lib/model/oas/recording.js';
import {
	checklistText,
	filterStatements,
	referenceStages,
	referenceStatements,
	statementKey
} from '#lib/model/oas/reference.js';
import type { OASStage } from '#lib/model/oas/templates.js';
import { alpineTree, bushwalking3Template, readJson } from './fixtures.js';

/** As JSON would send it: drops undefined fields and compares key order through the text */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));
const sameJsonText = (actual: unknown, expected: unknown) =>
	expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));

describe('OAS recording matches the Blazor app', () => {
	const golden = readJson<{
		today: string;
		verifier: OASVerifier;
		stage: OASStage;
		scoutRecord: OASRecord;
		joeyRecord: OASRecord;
		scoutTicked: string[];
		joeyTicked: string[];
		newTicked: string[];
		expected: Record<string, unknown>;
	}>('../golden/oas-recording.json');
	const template = bushwalking3Template();
	const answersOf = (record: OASRecord) => record.answers as Answers;
	const ticked = (list: ReturnType<typeof statements>, ids: string[]) =>
		list.filter((s) => ids.includes(s.inputId));

	const scoutStatements = statements(template, answersOf(golden.scoutRecord));
	const scoutAnswers = addVerifications(
		answersOf(golden.scoutRecord),
		ticked(scoutStatements, golden.scoutTicked),
		golden.verifier,
		golden.today
	);
	const joeyStatements = statements(template, answersOf(golden.joeyRecord));
	const joeyAnswers = addVerifications(
		answersOf(golden.joeyRecord),
		ticked(joeyStatements, golden.joeyTicked),
		golden.verifier,
		golden.today
	);
	const newStatements = statements(template, null);
	const newAnswers = addVerifications(
		null,
		ticked(newStatements, golden.newTicked),
		golden.verifier,
		golden.today
	);

	it('lists the same statements', () => {
		expect(asJson(scoutStatements)).toEqual(golden.expected.scoutStatements);
		expect(asJson(joeyStatements)).toEqual(golden.expected.joeyStatements);
	});

	// Request bodies are compared as JSON text, so the fields and their order are exactly as the Blazor app sends
	it('builds the same answers', () => {
		sameJsonText(scoutAnswers, golden.expected.scoutAnswers);
		sameJsonText(joeyAnswers, golden.expected.joeyAnswers);
	});

	it('sends the same update bodies, including for an older Joey record', () => {
		sameJsonText(updateBody(golden.scoutRecord, scoutAnswers), golden.expected.scoutUpdateBody);
		sameJsonText(updateBody(golden.joeyRecord, joeyAnswers), golden.expected.joeyUpdateBody);
	});

	it('sends the same create and submit bodies', () => {
		sameJsonText(createBody(template, golden.stage, 'cub', newAnswers), golden.expected.createBody);
		sameJsonText(submitBody('unit-1', 'leader-1'), golden.expected.submitBody);
	});
});

describe('Insights match the Blazor app', () => {
	const cases = readJson<
		{
			name: string;
			section: string;
			today: string;
			youth: YouthRecord[];
			requirements: OASRequirementStatus[];
			settings: InsightsSettings;
			focus: string[];
			expected: unknown;
			expectedStagesForDetail: unknown;
		}[]
	>('../golden/insights.json');

	for (const c of cases) {
		it(c.name, () => {
			const report = buildInsights(
				c.section,
				c.youth,
				c.requirements,
				c.settings,
				c.today,
				c.focus
			);
			expect(asJson(report)).toEqual(c.expected);
			const detail = stagesForDetail(
				report.nextStageDemand,
				report.moveUpCandidates,
				c.youth,
				c.settings.maxGapStages,
				c.settings.includeNonCoreOAS,
				report.minimumStage,
				report.maximumStage
			);
			expect(detail).toEqual(c.expectedStagesForDetail);
		});
	}
});

describe('Progress insights match the Blazor app', () => {
	const cases = readJson<
		{
			youth: YouthRecord;
			requirements: OASRequirementStatus[];
			started: string[];
			rules: SectionRules;
			today: string;
			includeNonCoreOAS: boolean;
			minStage: number;
			expected: unknown;
		}[]
	>('../golden/member-insights.json');

	it(`for ${cases.length} youth`, () => {
		for (const c of cases) {
			const report = buildMemberInsights(
				c.youth,
				c.requirements,
				new Set(c.started),
				c.rules,
				c.today,
				{
					includeNonCoreOAS: c.includeNonCoreOAS,
					minStage: c.minStage
				}
			);
			expect(asJson(report), c.youth.memberName).toEqual(c.expected);
		}
	});
});

describe('The OAS reference matches the Blazor app', () => {
	const golden = readJson<{
		alpineStages: unknown;
		bushwalking3Statements: unknown;
		filtered: { unitNight: string[]; searchMap: string[]; doNavigation: string[] };
		checklist: string;
	}>('../golden/oas-reference.json');
	const stage = {
		stream: 'bushwalking',
		streamTitle: 'Bushwalking',
		branch: '',
		branchTitle: '',
		stage: 3,
		templateLink: 'oas/bushwalking/3/latest.json'
	};
	const list = referenceStatements(stage, bushwalking3Template());

	it('builds the same stages and statements', () => {
		expect(asJson(referenceStages(alpineTree()))).toEqual(golden.alpineStages);
		expect(asJson(list)).toEqual(golden.bushwalking3Statements);
	});

	it('filters and shares the same way', () => {
		expect(filterStatements(list, { where: 'UnitNight' }).map(statementKey)).toEqual(
			golden.filtered.unitNight
		);
		expect(filterStatements(list, { search: 'map plan' }).map(statementKey)).toEqual(
			golden.filtered.searchMap
		);
		expect(
			filterStatements(list, { part: 'Do', theme: 'Navigation & Maps' }).map(statementKey)
		).toEqual(golden.filtered.doNavigation);
		expect(checklistText(list, 'Unit night')).toBe(golden.checklist);
	});
});
