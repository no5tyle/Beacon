// Ported from the C# MemberInsightsCalculatorTests
import { describe, expect, it } from 'vitest';
import { addMonths, addYears } from '#lib/model/dates.js';
import { buildMemberInsights } from '#lib/model/insights/memberInsightsCalculator.js';
import { milestoneRemaining } from '#lib/model/insights/memberModels.js';
import type { OASRequirementStatus, YouthRecord } from '#lib/model/insights/models.js';
import { emptyProgress } from '#lib/model/insights/progress.js';
import { defaultInsightsSettings, rulesFor } from '#lib/model/insights/settings.js';
import { loadWorksheet, worksheetRequirements } from './fixtures.js';

const TODAY = '2026-10-22';
const SCOUT_RULES = rulesFor(defaultInsightsSettings(), 'scout');
// Youth in the made-up unit's Bushwalking Stage 3 worksheet
const NEARLY_DONE = 'worksheet-12'; // only the two Review items left
const NAVIGATION_GAPS = 'worksheet-04';

function requirementsFor(memberId: string): OASRequirementStatus[] {
	return worksheetRequirements(loadWorksheet().filter((a) => a.MemberId === memberId));
}

function youth(memberId: string): YouthRecord {
	return {
		memberId,
		memberName: 'Test Youth',
		patrol: '',
		dateOfBirth: null,
		progress: {
			...emptyProgress(memberId),
			oasBushwalkingStage: 2,
			oasBushcraftStage: 3,
			oasCampingStage: 2
		}
	};
}

const started = () => new Set(['bushwalking/3']);

describe('member insights', () => {
	it('gives a nearly finished stage a single unit night plan', () => {
		const report = buildMemberInsights(
			youth(NEARLY_DONE),
			requirementsFor(NEARLY_DONE),
			started(),
			SCOUT_RULES,
			TODAY
		);

		expect(report.stages.length).toBe(1);
		const stage = report.stages[0];
		expect(stage.isClose).toBe(true);
		expect(stage.remaining.length).toBe(2);

		const activities = report.closeToComplete.filter((a) => a.kind === 'OAS');
		expect(activities.length).toBe(1);
		expect(activities[0].title.startsWith('One unit night')).toBe(true);
		expect(activities[0].coversAll).toBe(true);
		expect(activities[0].steps.map((s) => s.phase)).toEqual(['Review']);
		expect(activities[0].steps[0].items.length).toBe(2);
	});

	it('plans an outing with plan, do and review for an outing requirement', () => {
		const requirements = requirementsFor(NEARLY_DONE);
		requirements.find((r) => r.inputLabel.startsWith('I have attended a day bushwalk'))!.answered =
			false;
		requirements.find((r) => r.inputLabel.startsWith('I can help plan a balanced menu'))!.answered =
			false;
		const member = youth(NEARLY_DONE);
		member.progress.milestone1Outdoors = 2;

		const report = buildMemberInsights(member, requirements, started(), SCOUT_RULES, TODAY);

		const activity = report.closeToComplete.find((a) => a.kind === 'OAS')!;
		expect(activity.title).toContain('day bushwalk');
		expect(activity.steps.map((s) => s.phase)).toEqual([
			'Before: planning session',
			'On the day bushwalk',
			'After: review'
		]);
		expect(
			activity.notes.some((n) => n.includes('Milestone 1')),
			'Outing should be flagged as helping the Outdoors milestone count'
		).toBe(true);
	});

	it('flags a requirement that needs repeated outings', () => {
		const requirements = requirementsFor(NEARLY_DONE);
		requirements.find((r) => r.inputLabel.startsWith('I have attended at least two'))!.answered =
			false;

		const report = buildMemberInsights(
			youth(NEARLY_DONE),
			requirements,
			started(),
			SCOUT_RULES,
			TODAY
		);

		const activity = report.closeToComplete.find((a) => a.kind === 'OAS')!;
		expect(activity.coversAll).toBe(false);
		expect(activity.notes.some((n) => n.includes('at least two'))).toBe(true);
	});

	it('suggests the one activity left for a milestone', () => {
		const member = youth('m1');
		member.progress.milestone1Awarded = addYears(TODAY, -1);
		Object.assign(member.progress, {
			milestone2Community: 5,
			milestone2Outdoors: 5,
			milestone2Creative: 4,
			milestone2PersonalGrowth: 5,
			milestone2Lead: 4
		});

		const report = buildMemberInsights(member, [], new Set(), SCOUT_RULES, TODAY);

		expect(report.milestone).not.toBeNull();
		expect(report.milestone!.number).toBe(2);
		expect(milestoneRemaining(report.milestone!)).toBe(1);
		const activity = report.closeToComplete.find((a) => a.kind === 'Milestone')!;
		expect(activity.coversAll).toBe(true);
		expect(activity.title).toBe('One more activity completes Milestone 2');
		expect(activity.summary.startsWith('Participate: Creative')).toBe(true);
	});

	it('does not count a far away milestone as close', () => {
		const report = buildMemberInsights(youth('m2'), [], new Set(), SCOUT_RULES, TODAY);

		expect(report.milestone!.isClose).toBe(false);
		expect(report.closeToComplete.length).toBe(0);
		expect(report.highlights.some((h) => h.startsWith('Milestone 1'))).toBe(true);
	});

	it('highlights a theme recurring across stages', () => {
		const requirements = requirementsFor(NAVIGATION_GAPS);
		const extra = (inputLabel: string): OASRequirementStatus => ({
			stream: 'bushcraft',
			stage: 4,
			inputGroup: 'Do',
			inputLabel,
			memberId: NAVIGATION_GAPS,
			answered: false
		});
		requirements.push(
			extra('I can take a compass bearing and follow it.'),
			extra('I can tie a bowline.')
		);

		const report = buildMemberInsights(
			youth(NAVIGATION_GAPS),
			requirements,
			started(),
			SCOUT_RULES,
			TODAY
		);

		const navigation = report.themes[0];
		expect(navigation.theme).toBe('Navigation & Maps');
		expect([...navigation.stages].sort()).toEqual(['Bushcraft 4', 'Bushwalking 3']);
		expect(report.highlights.some((h) => h.startsWith('Recurring gap: Navigation & Maps'))).toBe(
			true
		);
		// Bushcraft 4 has nothing answered and was not started, so it is not "close"
		expect(report.stages.find((s) => s.stream === 'bushcraft')!.isClose).toBe(false);
	});

	it('hides non-core stages but still counts their progressions', () => {
		const member = youth(NEARLY_DONE);
		member.progress.oasStageProgressions = 4;
		const requirements = requirementsFor(NEARLY_DONE);
		requirements.push({
			stream: 'paddling',
			stage: 2,
			inputGroup: 'Do',
			inputLabel: 'I can wear a PFD correctly.',
			memberId: NEARLY_DONE,
			answered: false
		});
		const startedStages = new Set(['bushwalking/3', 'paddling/2']);

		const coreOnly = buildMemberInsights(member, requirements, startedStages, SCOUT_RULES, TODAY);
		const all = buildMemberInsights(member, requirements, startedStages, SCOUT_RULES, TODAY, {
			includeNonCoreOAS: true
		});

		expect(coreOnly.stages.some((s) => s.stream === 'paddling')).toBe(false);
		expect(coreOnly.closeToComplete.some((a) => a.target.startsWith('Paddling'))).toBe(false);
		expect(coreOnly.themes.some((t) => t.theme === 'Water Skills')).toBe(false);
		// The peak award progression requirement still reports the total across all streams
		const oas = coreOnly.peakAwardTasks.find((t) => t.key === 'oas')!;
		expect(oas.done).toBe(false);
		expect(oas.detail.startsWith('4 of 10')).toBe(true);
		expect(all.stages.some((s) => s.stream === 'paddling')).toBe(true);
	});

	it('hides lower stages on the progress page', () => {
		const report = buildMemberInsights(
			youth(NEARLY_DONE),
			requirementsFor(NEARLY_DONE),
			started(),
			SCOUT_RULES,
			TODAY,
			{
				minStage: 4
			}
		);

		expect(report.stages.length, 'Bushwalking 3 is below the minimum').toBe(0);
		expect(report.closeToComplete.length).toBe(0);
	});

	it('works out the move up date from the section age', () => {
		const member = youth('m3');
		member.dateOfBirth = addMonths(addYears(TODAY, -15), 3);

		const report = buildMemberInsights(member, [], new Set(), SCOUT_RULES, TODAY);

		expect(report.moveUpDate).toBe(addMonths(TODAY, 3));
		expect(report.highlights[0].startsWith('Moves up around')).toBe(true);
	});
});
