// Ported from the C# InsightsCalculatorTests
import { describe, expect, it } from 'vitest';
import { addMonths, addYears } from '#lib/model/dates.js';
import {
	buildInsights,
	isCoreStream,
	isEligible,
	MAX_STAGE,
	moveUpCandidates,
	nextStageDemand,
	peakAwardBreakdown,
	peakAwardTasks,
	priorityTaskBoard,
	requirementGaps,
	stagesForDetail,
	STREAMS,
	streamCoverage
} from '#lib/model/insights/insightsCalculator.js';
import { outstandingCount } from '#lib/model/insights/models.js';
import { emptyProgress } from '#lib/model/insights/progress.js';
import {
	defaultInsightsSettings,
	maximumStage,
	minimumStage,
	rulesFor
} from '#lib/model/insights/settings.js';
import {
	classify,
	isUnitNightSuitable,
	OUTING_THEME,
	REVIEW_THEME,
	VERIFY_THEME
} from '#lib/model/insights/skillThemes.js';
import { sum } from '#lib/model/util.js';
import { bushwalkingStage3Unit, youthFromWallchart } from './fixtures.js';

const TODAY = '2026-10-22';
const yearsAgo = (years: number, plusMonths = 0) => addMonths(addYears(TODAY, -years), plusMonths);

describe('skill themes', () => {
	it('groups requirements into themes', () => {
		expect(classify('Do', 'I can identify the features of a topographical map.')).toBe(
			'Navigation & Maps'
		);
		expect(classify('Do', 'I know how to treat cuts and minor bleeding.')).toBe(
			'First Aid & Safety'
		);
		expect(
			classify('Plan>', 'I can help a Stage 1 Scout to pack their backpack for a bushwalk.')
		).toBe('Gear & Packing');
		expect(
			classify(
				'Plan',
				'I know how and where to get the latest weather forecast for the area I will be bushwalking in.'
			)
		).toBe('Weather & Environment');
		expect(
			classify(
				'Review',
				'I have discussed the top five things I have learnt throughout Stages 1-3 of Bushwalking.'
			)
		).toBe(REVIEW_THEME);
		expect(classify('Verify', 'My logbook is up to date at the end of this stage.')).toBe(
			VERIFY_THEME
		);
	});

	it('marks outing requirements as not suitable for a unit night', () => {
		expect(
			isUnitNightSuitable(
				'Do',
				'I have attended a day bushwalk at this stage of at least six hours duration.'
			)
		).toBe(false);
		expect(
			isUnitNightSuitable(
				'Do',
				'I have attended at least two bushwalking activities at this stage.'
			)
		).toBe(false);
		expect(
			isUnitNightSuitable('Verify', 'My logbook is up to date at the end of this stage.')
		).toBe(false);
		expect(isUnitNightSuitable('Do', 'I know how to treat cuts and minor bleeding.')).toBe(true);
		expect(
			isUnitNightSuitable(
				'Plan',
				'I have considered bushwalking etiquette when planning for a journey.'
			)
		).toBe(true);
		expect(
			classify('Do', 'I have attended at least two bushwalking activities at this stage.')
		).toBe(OUTING_THEME);
	});
});

describe('insights calculator', () => {
	it('stream coverage matches the wallchart', () => {
		const youth = youthFromWallchart();
		const coverage = streamCoverage(youth, true);

		expect(coverage.length).toBe(STREAMS.length);
		for (const stream of coverage) {
			expect(stream.reachedStage[1], stream.stream).toBe(youth.length - stream.notStarted);
			for (let stage = 2; stage <= MAX_STAGE; stage++)
				expect(stream.reachedStage[stage]).toBeLessThanOrEqual(stream.reachedStage[stage - 1]);
		}
		const bushwalking = coverage.find((c) => c.stream === 'bushwalking')!;
		expect(bushwalking.notStarted).toBe(
			youth.filter((y) => y.progress.oasBushwalkingStage === 0).length
		);
		for (let stage = 1; stage <= MAX_STAGE; stage++) {
			for (const id of bushwalking.nextStageMemberIds[stage])
				expect(youth.find((y) => y.memberId === id)!.progress.oasBushwalkingStage).toBe(stage - 1);
		}
		// Each youth appears once, unless they've completed every stage
		const listed = Array.from(
			{ length: MAX_STAGE },
			(_, i) => bushwalking.nextStageMemberIds[i + 1]
		).flat();
		expect(new Set(listed).size).toBe(listed.length);
		expect(listed.length).toBe(
			youth.filter((y) => y.progress.oasBushwalkingStage < MAX_STAGE).length
		);
	});

	it('covers core streams only by default', () => {
		const youth = youthFromWallchart();

		const coverage = streamCoverage(youth);
		const demand = nextStageDemand(youth, new Set());

		expect(coverage.map((c) => c.stream).sort()).toEqual(['bushcraft', 'bushwalking', 'camping']);
		expect(demand.every((d) => isCoreStream(d.stream))).toBe(true);
	});

	it('leaves out non-core requirements unless asked', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		youth.forEach((y) => (y.progress.oasAquaticsStage = 2));
		requirements.push(
			...youth.map((y) => ({
				stream: 'aquatics',
				stage: 3,
				inputGroup: 'Do',
				inputLabel: 'I can perform a rescue using a throw bag.',
				memberId: y.memberId,
				answered: false
			}))
		);

		const coreOnly = buildInsights(
			'scout',
			youth,
			requirements,
			defaultInsightsSettings({ sectionStagesOnly: false }),
			TODAY
		);
		const all = buildInsights(
			'scout',
			youth,
			requirements,
			defaultInsightsSettings({ includeNonCoreOAS: true, sectionStagesOnly: false }),
			TODAY
		);

		expect(coreOnly.requirementGaps.some((g) => g.stream === 'aquatics')).toBe(false);
		expect(coreOnly.skillThemes.some((t) => t.name === 'Water Skills')).toBe(false);
		expect(all.requirementGaps.some((g) => g.stream === 'aquatics')).toBe(true);
	});

	it('next stage demand skips optional streams youth have not started', () => {
		const youth = youthFromWallchart();
		const demand = nextStageDemand(youth, new Set(), true);

		expect(
			demand.find((d) => d.stream === 'boating' && d.stage === 1),
			'Boating stage 1 should not be demanded by youth who have not started boating'
		).toBeUndefined();
		// Every youth appears exactly once per core stream
		for (const core of STREAMS.filter((s) => s.isCore))
			expect(
				sum(demand.filter((d) => d.stream === core.key).map((d) => d.memberIds.length)),
				core.key
			).toBe(youth.length);
	});

	it('move up candidates use the section age and window', () => {
		const youth = youthFromWallchart();
		youth[0].dateOfBirth = yearsAgo(15, 2); // 2 months to go
		youth[1].dateOfBirth = yearsAgo(15, 5); // 5 months to go
		youth[2].dateOfBirth = yearsAgo(12); // 3 years to go
		const settings = defaultInsightsSettings();

		const candidates = moveUpCandidates(youth, rulesFor(settings, 'scout'), settings, TODAY);

		expect(candidates.length).toBe(2);
		expect(candidates[0].memberId).toBe(youth[0].memberId);
		expect(candidates[0].urgency).toBe('High');
		expect(candidates[1].urgency).toBe('Medium');

		// The first youth in the fixture has not done Milestone 3 and has 2 stage progressions
		const oas = candidates[0].tasks.find((t) => t.key === 'oas')!;
		expect(oas.done).toBe(false);
		expect(oas.detail.startsWith('2 of 10')).toBe(true);
		const milestone = candidates[0].tasks.find((t) => t.key === 'milestone')!;
		expect(milestone.done).toBe(false);
		expect(milestone.detail).toContain('Milestone 1');
	});

	it('peak award OAS follows Terrain wording', () => {
		const settings = defaultInsightsSettings();
		const youth = {
			memberId: 'y',
			memberName: '',
			patrol: '',
			dateOfBirth: null,
			progress: {
				...emptyProgress('y'),
				oasBushcraftStage: 5,
				oasBushwalkingStage: 6,
				oasCampingStage: 4,
				oasStageProgressions: 11,
				oasSectionStagesAwarded: [4, 4, 5, 6, 7, 2]
			}
		};

		const scout = peakAwardTasks(youth, rulesFor(settings, 'scout'), []);
		expect(scout.find((t) => t.key === 'oas')!.done, '11 of 10 progressions').toBe(true);
		const core = scout.find((t) => t.key === 'oas:core')!;
		expect(core.title).toBe('Stage 5 in all core OAS');
		expect(core.done).toBe(false);
		expect(core.detail).toBe('Below Stage 5: Camping 4');
		expect(
			scout.some((t) => t.key === 'oas:high'),
			'Scouts have no Stage 4+ rule'
		).toBe(false);

		const venturer = peakAwardTasks(youth, rulesFor(settings, 'venturer'), []);
		expect(venturer.find((t) => t.key === 'oas')!.done, '11 of 12 progressions').toBe(false);
		const high = venturer.find((t) => t.key === 'oas:high')!;
		expect(high.done).toBe(true);
		expect(high.detail).toBe('5 of 4');

		const joey = peakAwardTasks(youth, rulesFor(settings, 'joey'), []);
		expect(
			joey.some((t) => t.key === 'oas'),
			'Joeys have no progression count'
		).toBe(false);
		expect(joey.find((t) => t.key === 'oas:core')!.done).toBe(true);
	});

	it('peak award breakdown weights and caps', () => {
		const settings = defaultInsightsSettings();
		const progress = {
			...emptyProgress(),
			milestone1Awarded: TODAY,
			milestone2Awarded: TODAY,
			introToScouting: TODAY,
			introToSection: TODAY,
			oasStageProgressions: 7,
			siaEnvironment: 4,
			siaArtsLiterature: 3,
			leadershipCourse: TODAY
		};
		const byName = (list: ReturnType<typeof peakAwardBreakdown>) =>
			Object.fromEntries(list.map((c) => [c.name, c]));

		const scout = byName(peakAwardBreakdown(progress, rulesFor(settings, 'scout')));
		expect(scout['Essentials'].earned, '9 per milestone plus 1.5 per intro').toBeCloseTo(21, 3);
		expect(scout['OAS'].earned, '7 of 10 progressions at 3 each').toBeCloseTo(21, 3);
		expect(scout['SIA'].earned, '7 projects is capped at the 6 needed').toBeCloseTo(25, 3);
		expect(scout['Personal development'].earned).toBe(5);
		expect(scout['Journey'].earned).toBe(0);
		expect(scout['Journey'].max).toBe(8);
		expect(sum(Object.values(scout).map((c) => c.earned))).toBeCloseTo(72, 3);

		progress.oasStageProgressions = 20;
		progress.milestone3Awarded = TODAY;
		const rover = byName(peakAwardBreakdown(progress, rulesFor(settings, 'rover')));
		expect(rover['OAS'].earned, '20 progressions is capped at the 14 needed').toBeCloseTo(30, 3);
		expect(rover['Essentials'].earned).toBeCloseTo(30, 3);

		const joey = byName(
			peakAwardBreakdown(
				{ ...emptyProgress(), oasBushcraftStage: 1, oasCampingStage: 2, siaEnvironment: 3 },
				rulesFor(settings, 'joey')
			)
		);
		expect(joey['OAS'].earned, 'Stage 1 in 2 of 3 core streams').toBeCloseTo(20, 3);
		expect(joey['SIA'].earned, '3 of 6 projects of 28').toBeCloseTo(14, 3);
		expect('Personal development' in joey).toBe(false);
		expect(sum(Object.values(joey).map((c) => c.max))).toBeCloseTo(100, 3);
		expect(sum(Object.values(rover).map((c) => c.max))).toBeCloseTo(100, 3);
	});

	it('peak award SIA and course follow Terrain', () => {
		const settings = defaultInsightsSettings();
		const youth = (memberId: string, progress: Partial<ReturnType<typeof emptyProgress>>) => ({
			memberId,
			memberName: '',
			patrol: '',
			dateOfBirth: null,
			progress: { ...emptyProgress(memberId), ...progress }
		});
		const oneArea = youth('a', { siaEnvironment: 6 });
		const twoAreas = youth('b', { siaEnvironment: 4, siaArtsLiterature: 2 });
		const sia = (y: typeof oneArea, section: string) =>
			peakAwardTasks(y, rulesFor(settings, section), []).find((t) => t.key === 'sia')!;

		const cubSia = sia(oneArea, 'cub');
		expect(cubSia.title).toBe('6 SIA projects across 2 areas');
		expect(cubSia.done, "Six projects in one area isn't enough for the Grey Wolf Award").toBe(
			false
		);
		expect(cubSia.detail).toBe('6 of 6 projects, 1 of 2 areas');
		expect(sia(twoAreas, 'cub').done).toBe(true);
		expect(sia(twoAreas, 'scout').done, 'Scouts need 3 areas').toBe(false);

		const rover = rulesFor(settings, 'rover');
		expect([rover.siaProjectsRequired, rover.siaAreasRequired]).toEqual([6, 4]);
		expect(
			peakAwardTasks(oneArea, rulesFor(settings, 'joey'), []).some((t) => t.key === 'peak:course'),
			'Joeys have no personal development course'
		).toBe(false);
		expect(
			peakAwardTasks(oneArea, rulesFor(settings, 'cub'), []).some((t) => t.key === 'peak:course')
		).toBe(true);
		expect(rulesFor(settings, 'joey').peakAwardName).toBe('Joey Scout Challenge Award');
		expect(rulesFor(settings, 'venturer').peakAwardName).toBe("King's Scout Award");
	});

	it('treats focus youth as priority', () => {
		const youth = youthFromWallchart();
		youth[0].dateOfBirth = yearsAgo(15, 2); // moving up
		youth[1].dateOfBirth = yearsAgo(12); // not moving up, picked as focus
		youth[2].dateOfBirth = null; // no birth date, picked as focus
		const focus = [youth[1].memberId, youth[2].memberId];
		const settings = defaultInsightsSettings();

		const candidates = moveUpCandidates(
			youth,
			rulesFor(settings, 'scout'),
			settings,
			TODAY,
			[],
			focus
		);

		expect(candidates.length).toBe(3);
		const movingUp = candidates.find((c) => c.memberId === youth[0].memberId)!;
		expect(movingUp.isMovingUp).toBe(true);
		expect(movingUp.isFocus).toBe(false);
		const picked = candidates.find((c) => c.memberId === youth[1].memberId)!;
		expect(picked.isFocus).toBe(true);
		expect(picked.isMovingUp).toBe(false);
		expect(picked.urgency).toBe('Medium');
		const noBirthDate = candidates.find((c) => c.memberId === youth[2].memberId)!;
		expect(noBirthDate.moveUpDate).toBeNull();
		expect(noBirthDate.tasks.length).toBeGreaterThan(0);
		expect(candidates[0].memberId, 'Youth moving up within 3 months still come first').toBe(
			youth[0].memberId
		);
	});

	it('weights requirement gaps for focus youth', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		const focusId = youth[0].memberId;

		const report = buildInsights(
			'scout',
			youth,
			requirements,
			defaultInsightsSettings({ sectionStagesOnly: false }),
			TODAY,
			[focusId]
		);

		expect(report.moveUpCandidates.length).toBe(1);
		expect(report.moveUpCandidates[0].isFocus).toBe(true);
		expect(
			report.requirementGaps
				.filter((g) => g.outstandingMemberIds.includes(focusId))
				.every((g) => g.priorityMemberCount === 1)
		).toBe(true);
	});

	it('groups outstanding tasks on the priority task board', () => {
		const youth = youthFromWallchart();
		youth[0].dateOfBirth = yearsAgo(15, 1);
		youth[1].dateOfBirth = yearsAgo(15, 4);
		const settings = defaultInsightsSettings();
		const candidates = moveUpCandidates(youth, rulesFor(settings, 'scout'), settings, TODAY);

		const board = priorityTaskBoard(candidates);
		const aj = board.find((t) => t.key === 'peak:aj')!;
		expect(aj.memberNames.length).toBe(2);
		expect(aj.highUrgencyCount).toBe(1);
	});

	it('requirement gaps count outstanding members', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		const gaps = requirementGaps(youth, requirements, new Set());

		expect(gaps.length).toBeGreaterThan(0);
		expect(
			gaps.some((g) => g.inputGroup === 'Verify'),
			'Logbook check is not a programme item'
		).toBe(false);
		for (const gap of gaps) {
			expect(outstandingCount(gap)).toBeLessThanOrEqual(gap.candidateCount);
			const expected = requirements.filter(
				(r) => r.inputLabel === gap.inputLabel && !r.answered
			).length;
			expect(outstandingCount(gap), gap.inputLabel).toBe(expected);
		}
	});

	it('requirement gaps carry the statement explanation', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		const label = requirements.find((r) => r.inputGroup === 'Do')!.inputLabel;
		requirements.find((r) => r.inputLabel === label)!.inputDetail =
			'Activity should take no more than an hour.';

		const gaps = requirementGaps(youth, requirements, new Set());

		expect(gaps.find((g) => g.inputLabel === label)!.inputDetail).toBe(
			'Activity should take no more than an hour.'
		);
		expect(gaps.filter((g) => g.inputLabel !== label).every((g) => g.inputDetail === '')).toBe(
			true
		);
	});

	it('requirement gaps ignore youth not on that stage', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		const skipped = youth[0];
		skipped.progress.oasBushwalkingStage = 3;

		const gaps = requirementGaps(youth, requirements, new Set());

		expect(gaps.some((g) => g.outstandingMemberIds.includes(skipped.memberId))).toBe(false);
	});

	it('eligibility follows Terrain credit rule', () => {
		const progress = { ...emptyProgress(), oasBushwalkingStage: 2 };

		expect(isEligible(progress, 'bushwalking', 3), 'Next stage').toBe(true);
		expect(isEligible(progress, 'bushwalking', 5), 'Stage 5 needs Stage 2').toBe(true);
		expect(isEligible(progress, 'bushwalking', 6), 'Stage 6 needs Stage 3').toBe(false);
		expect(isEligible(progress, 'bushwalking', 2), 'Already complete').toBe(false);
		expect(isEligible(emptyProgress(), 'camping', 3), 'Stages 1 to 3 are open to everyone').toBe(
			true
		);
		expect(isEligible(emptyProgress(), 'camping', 4)).toBe(false);
	});

	it('gaps count eligible and active youth separately', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		// One youth hasn't started bushwalking at all but can still work on Stage 3
		youth[0].progress.oasBushwalkingStage = 0;
		// Two youth have started Stage 3 in Terrain
		youth[1].progress.oasStagesInProgress.push('bushwalking/3');
		youth[2].progress.oasStagesInProgress.push('bushwalking/3');

		const gaps = requirementGaps(youth, requirements, new Set());

		const gap = gaps[0];
		expect(gap.candidateCount, "Everyone who hasn't completed Stage 3 is eligible").toBe(
			youth.length
		);
		expect(gap.completedCount).toBe(0);
		expect(gap.activeCandidateCount).toBe(2);
		expect(
			gap.activeOutstandingMemberIds.every(
				(id) => id === youth[1].memberId || id === youth[2].memberId
			)
		).toBe(true);
		expect(gaps.some((g) => g.outstandingMemberIds.includes(youth[0].memberId))).toBe(true);
	});

	it('completed youth count towards the total but not outstanding', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		const finished = youth[0];
		finished.progress.oasBushwalkingStage = 4;

		const gap = requirementGaps(youth, requirements, new Set())[0];

		expect(gap.completedCount).toBe(1);
		expect(gap.candidateCount, 'Completed youth stay in the total').toBe(youth.length);
		expect(gap.outstandingMemberIds.includes(finished.memberId)).toBe(false);
	});

	it('hides lower stages for the section', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		requirements.push(
			...youth.map((y) => ({
				stream: 'bushwalking',
				stage: 4,
				inputGroup: 'Do',
				inputLabel: 'I can plan a route.',
				memberId: y.memberId,
				answered: false
			}))
		);

		const scouts = buildInsights('scout', youth, requirements, defaultInsightsSettings(), TODAY);
		const cubs = buildInsights('cub', youth, requirements, defaultInsightsSettings(), TODAY);
		const shown = buildInsights(
			'scout',
			youth,
			requirements,
			defaultInsightsSettings({ sectionStagesOnly: false }),
			TODAY
		);

		expect(scouts.minimumStage).toBe(4);
		expect(
			scouts.requirementGaps.every((g) => g.stage >= 4),
			'Scouts hide Stage 3 and below'
		).toBe(true);
		expect(scouts.requirementGaps.some((g) => g.stage === 4)).toBe(true);
		expect(scouts.nextStageDemand.every((d) => d.stage >= 4)).toBe(true);
		expect(cubs.minimumStage).toBe(2);
		expect(
			cubs.requirementGaps.some((g) => g.stage === 3),
			'Cubs only hide Stage 1'
		).toBe(true);
		expect(shown.minimumStage).toBe(1);
		expect(shown.requirementGaps.some((g) => g.stage === 3)).toBe(true);
	});

	it('hides stages above the section', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		youth.forEach((y) => (y.progress.oasBushwalkingStage = 3));
		for (const stage of [4, 5, 6])
			requirements.push(
				...youth.map((y) => ({
					stream: 'bushwalking',
					stage,
					inputGroup: 'Do',
					inputLabel: `Stage ${stage} skill.`,
					memberId: y.memberId,
					answered: false
				}))
			);

		const scouts = buildInsights('scout', youth, requirements, defaultInsightsSettings(), TODAY);
		const all = buildInsights(
			'scout',
			youth,
			requirements,
			defaultInsightsSettings({ sectionStagesOnly: false }),
			TODAY
		);

		expect(scouts.maximumStage).toBe(5);
		expect(
			[...new Set(scouts.requirementGaps.map((g) => g.stage))].sort(),
			'Scouts see Stages 4 and 5 only'
		).toEqual([4, 5]);
		expect(all.requirementGaps.some((g) => g.stage === 6)).toBe(true);

		const settings = defaultInsightsSettings();
		expect([minimumStage(settings, 'joey'), maximumStage(settings, 'joey')]).toEqual([1, 1]);
		expect([minimumStage(settings, 'cub'), maximumStage(settings, 'cub')]).toEqual([2, 3]);
		settings.sectionStagesOnly = false;
		expect([minimumStage(settings, 'cub'), maximumStage(settings, 'cub')]).toEqual([1, 9]);
	});

	it('detail stages include active work', () => {
		const youth = youthFromWallchart();
		youth.forEach((y) => (y.progress.oasStagesInProgress = ['camping/4', 'paddling/2']));
		const demand = nextStageDemand(youth, new Set());

		const stages = stagesForDetail(demand, [], youth, 1);

		expect(stages, 'Most active core stage wins; non-core is left out').toEqual([
			{ stream: 'camping', stage: 4 }
		]);
	});

	it('builds programme suggestions', () => {
		const { youth, requirements } = bushwalkingStage3Unit();
		youth[0].dateOfBirth = yearsAgo(15, 2);
		const settings = defaultInsightsSettings({ suggestedNights: 4, sectionStagesOnly: false });

		const report = buildInsights('scout', youth, requirements, settings, TODAY);

		expect(report.youthCount).toBe(youth.length);
		expect(report.moveUpCandidates.length).toBe(1);
		expect(report.skillThemes.some((t) => t.name === 'Navigation & Maps')).toBe(true);
		expect(report.skillThemes.every((t) => t.requirements.every((r) => r.unitNightSuitable))).toBe(
			true
		);
		expect(report.suggestedNights.length).toBeGreaterThan(0);
		expect(report.suggestedNights.length).toBeLessThanOrEqual(4);
		expect(report.suggestedNights.map((n) => n.number)).toEqual(
			Array.from({ length: report.suggestedNights.length }, (_, i) => i + 1)
		);
		// The challenge area balance night is included because nobody in the made-up unit has milestone progress
		expect(report.suggestedNights.some((n) => n.title.endsWith('challenge night'))).toBe(true);
	});
});
