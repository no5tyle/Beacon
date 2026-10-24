// Insights for one youth: what they are lacking, recurring skill themes in those gaps,
// and an activity plan for anything they are close to completing. Ported from Beacon's C# MemberInsightsCalculator.

import { daysBetween, monthYear, type CalendarDate } from '../dates.js';
import {
	asc,
	containsIgnoreCase,
	desc,
	distinct,
	formatOneDecimal,
	groupBy,
	roundHalfEven,
	sortBy
} from '../util.js';
import {
	CHALLENGE_AREAS,
	currentMilestone,
	isCoreStream,
	MAX_STAGE,
	MILESTONE_REQUIREMENTS,
	moveUpDate,
	peakAwardBreakdown,
	peakAwardTasks,
	stageKey,
	streamDisplay
} from './insightsCalculator.js';
import {
	milestoneRemaining,
	needRemaining,
	percentDone,
	type ActivityStep,
	type ActivitySuggestion,
	type MemberInsightsReport,
	type MemberThemeGap,
	type MilestoneProgress,
	type RemainingRequirement,
	type StageProgress
} from './memberModels.js';
import type { OASRequirementStatus, YouthRecord } from './models.js';
import type { SectionRules } from './settings.js';
import {
	classify,
	descriptionFor,
	isUnitNightSuitable,
	normaliseGroup,
	OTHER_THEME,
	OUTING_THEME
} from './skillThemes.js';

/** A stage or milestone counts as "close" with this many items or fewer left */
export const CLOSE_REMAINING = 4;
export const CLOSE_PERCENT = 0.7;

const STREAM_OUTINGS: Record<string, string> = {
	bushcraft: 'bushcraft day',
	bushwalking: 'day bushwalk',
	camping: 'overnight camp',
	alpine: 'snow trip',
	cycling: 'group bike ride',
	vertical: 'climbing or abseiling session',
	aquatics: 'pool or beach session',
	boating: 'sailing day',
	paddling: 'paddling trip'
};

const CHALLENGE_AREA_IDEAS: Record<string, string> = {
	Community: 'a service project, community visit or fundraiser',
	Outdoors: 'a hike, wide game or outdoor skills session',
	Creative: 'a build, craft, cooking or performance challenge',
	'Personal Growth': 'a goal setting, first aid or wellbeing session'
};

/** Phrases that mean one activity cannot satisfy the requirement */
const REPEAT_PHRASES = [
	'at least two',
	'at least three',
	'at least 2',
	'at least 3',
	'two or more',
	'nights',
	'several'
];

export interface MemberInsightsOptions {
	includeNonCoreOAS?: boolean;
	minStage?: number;
	highestStage?: number;
}

/**
 * @param startedStages Stages the youth has started in Terrain, as "stream/stage" (see stageKey)
 */
export function buildMemberInsights(
	youth: YouthRecord,
	requirements: OASRequirementStatus[],
	startedStages: ReadonlySet<string>,
	rules: SectionRules,
	today: CalendarDate,
	{ includeNonCoreOAS = false, minStage = 1, highestStage = MAX_STAGE }: MemberInsightsOptions = {}
): MemberInsightsReport {
	const stageOf = (key: string) => Number(key.split('/')[1]);
	const streamOf = (key: string) => key.split('/')[0];
	requirements = requirements.filter((r) => r.stage >= minStage && r.stage <= highestStage);
	let started = [...startedStages].filter(
		(s) => stageOf(s) >= minStage && stageOf(s) <= highestStage
	);
	if (!includeNonCoreOAS) {
		requirements = requirements.filter((r) => isCoreStream(r.stream));
		started = started.filter((s) => isCoreStream(streamOf(s)));
	}

	const report: MemberInsightsReport = {
		rules,
		moveUpDate: null,
		monthsToMoveUp: null,
		highlights: [],
		peakAwardTasks: peakAwardTasks(youth, rules, requirements),
		peakAwardBreakdown: peakAwardBreakdown(youth.progress, rules),
		milestone: milestoneProgressFor(youth),
		stages: stageProgressFor(youth, requirements, new Set(started)),
		themes: [],
		closeToComplete: []
	};

	if (youth.dateOfBirth) {
		report.moveUpDate = moveUpDate(youth.dateOfBirth, rules);
		report.monthsToMoveUp = roundHalfEven(daysBetween(today, report.moveUpDate) / 30.44, 1);
	}

	report.themes = themeGaps(report.stages);

	if (report.milestone?.isClose) report.closeToComplete.push(milestoneActivity(report.milestone));
	for (const stage of sortBy(
		report.stages.filter((s) => s.isClose),
		asc((s) => s.remaining.length)
	))
		report.closeToComplete.push(stageActivity(stage, report.milestone));

	report.highlights = highlights(report);
	return report;
}

export function milestoneProgressFor(youth: YouthRecord): MilestoneProgress | null {
	if (youth.progress.milestone3Awarded !== null) return null;
	const { number, counts, leadAssist } = currentMilestone(youth.progress);
	const need = MILESTONE_REQUIREMENTS[number];
	const progress: MilestoneProgress = {
		number,
		participates: CHALLENGE_AREAS.map((area, i) => ({
			challengeArea: area,
			have: counts[i],
			need: need.participate
		})),
		leadAssist: { challengeArea: 'Lead / Assist', have: leadAssist, need: need.leadAssist },
		isClose: false
	};
	const remaining = milestoneRemaining(progress);
	progress.isClose = remaining > 0 && remaining <= CLOSE_REMAINING;
	return progress;
}

export function stageProgressFor(
	youth: YouthRecord,
	requirements: OASRequirementStatus[],
	startedStages: ReadonlySet<string>
): StageProgress[] {
	const own = requirements
		.filter((r) => r.memberId === youth.memberId)
		.filter((r) => normaliseGroup(r.inputGroup) !== 'Verify');
	const stages = groupBy(own, (r) => [r.stream, r.stage]).map(
		({ key: [stream, stageNumber], items }) => {
			const s = stream as string;
			const n = stageNumber as number;
			const remaining: RemainingRequirement[] = items
				.filter((r) => !r.answered)
				.map((r) => ({
					inputGroup: normaliseGroup(r.inputGroup),
					inputLabel: r.inputLabel,
					theme: classify(r.inputGroup, r.inputLabel),
					unitNightSuitable: isUnitNightSuitable(r.inputGroup, r.inputLabel)
				}));
			const stage: StageProgress = {
				stream: s,
				streamDisplay: streamDisplay(s),
				stage: n,
				started: startedStages.has(stageKey(s, n)) || remaining.length < items.length,
				total: items.length,
				done: items.filter((r) => r.answered).length,
				remaining,
				isClose: false
			};
			stage.isClose =
				stage.started &&
				remaining.length > 0 &&
				(remaining.length <= CLOSE_REMAINING || percentDone(stage) >= CLOSE_PERCENT);
			return stage;
		}
	);
	return sortBy(
		stages.filter((s) => s.remaining.length > 0),
		desc((s) => s.started),
		desc(percentDone),
		asc((s) => s.stream)
	);
}

export function themeGaps(stages: StageProgress[]): MemberThemeGap[] {
	const pairs = stages.flatMap((stage) =>
		stage.remaining.map((requirement) => ({ stage, requirement }))
	);
	const gaps = groupBy(pairs, (x) => x.requirement.theme).map(({ key, items }): MemberThemeGap => ({
		theme: key,
		description: descriptionFor(key),
		count: items.length,
		stages: distinct(items.map((x) => `${x.stage.streamDisplay} ${x.stage.stage}`)),
		unitNightSuitable: items.every((x) => x.requirement.unitNightSuitable)
	}));
	return sortBy(
		gaps,
		desc((t) => t.stages.length),
		desc((t) => t.count)
	);
}

export function milestoneActivity(milestone: MilestoneProgress): ActivitySuggestion {
	const steps: ActivityStep[] = [];
	for (const area of milestone.participates.filter((p) => needRemaining(p) > 0)) {
		steps.push({
			phase: `Participate: ${area.challengeArea} x${needRemaining(area)}`,
			items: [CHALLENGE_AREA_IDEAS[area.challengeArea]]
		});
	}
	if (needRemaining(milestone.leadAssist) > 0) {
		steps.push({
			phase: `Lead or assist x${needRemaining(milestone.leadAssist)}`,
			items: [
				'Give them a lead or assist role on upcoming patrol or unit activities, in any challenge area'
			]
		});
	}

	const activityCount = milestoneRemaining(milestone);
	const suggestion: ActivitySuggestion = {
		kind: 'Milestone',
		target: `Milestone ${milestone.number}`,
		title: '',
		summary: '',
		coversAll: activityCount === 1,
		steps,
		notes: []
	};
	if (activityCount === 1) {
		if (steps.length !== 1) throw new Error('One activity left should be a single step');
		const step = steps[0];
		suggestion.title = `One more activity completes Milestone ${milestone.number}`;
		suggestion.summary = `${step.phase.split(' x')[0]}: ${step.items[0]}.`;
		suggestion.steps = [];
	} else {
		suggestion.title = `${activityCount} activities from Milestone ${milestone.number}`;
		suggestion.summary =
			'Each activity counts once, in one challenge area and one role, so these need separate activities. A camp weekend with each session logged as its own activity can cover them together.';
	}
	return suggestion;
}

export function stageActivity(
	stage: StageProgress,
	milestone: MilestoneProgress | null
): ActivitySuggestion {
	const needsOuting = stage.remaining.some((r) => r.inputGroup === 'Do' && !r.unitNightSuitable);
	const repeatItems = stage.remaining.filter((r) =>
		REPEAT_PHRASES.some((p) => containsIgnoreCase(r.inputLabel, p))
	);
	const outing = STREAM_OUTINGS[stage.stream] ?? 'outing';
	const target = `${stage.streamDisplay} Stage ${stage.stage}`;
	const labels = (group: string) =>
		stage.remaining.filter((r) => r.inputGroup === group).map((r) => r.inputLabel);

	const steps: ActivityStep[] = needsOuting
		? [
				{ phase: 'Before: planning session', items: labels('Plan') },
				{ phase: `On the ${outing}`, items: labels('Do') },
				{ phase: 'After: review', items: labels('Review') }
			]
		: [
				{ phase: 'Plan', items: labels('Plan') },
				{ phase: 'Skills', items: labels('Do') },
				{ phase: 'Review', items: labels('Review') }
			];

	const themes = distinct(
		stage.remaining.map((r) => r.theme).filter((t) => t !== OTHER_THEME && t !== OUTING_THEME)
	);
	const count = stage.remaining.length;
	const suggestion: ActivitySuggestion = {
		kind: 'OAS',
		target,
		title: needsOuting ? `A ${outing} to finish ${target}` : `One unit night to finish ${target}`,
		summary:
			`${count} requirement${count === 1 ? '' : 's'} left (${stage.done}/${stage.total} done).` +
			(themes.length > 0 ? ` Build it around ${themes.join(', ')}.` : ''),
		coversAll: repeatItems.length === 0,
		steps: steps.filter((s) => s.items.length > 0),
		notes: []
	};

	for (const item of repeatItems)
		suggestion.notes.push(`Needs more than one activity: "${item.inputLabel}"`);
	if (
		needsOuting &&
		milestone &&
		milestone.participates.some((p) => p.challengeArea === 'Outdoors' && needRemaining(p) > 0)
	)
		suggestion.notes.push(
			`Logged as an Outdoors activity it also counts towards Milestone ${milestone.number}.`
		);
	return suggestion;
}

function highlights(report: MemberInsightsReport): string[] {
	const result: string[] = [];
	if (report.monthsToMoveUp !== null && report.moveUpDate !== null) {
		const months = report.monthsToMoveUp;
		const outstanding = report.peakAwardTasks.filter((t) => !t.done).length;
		const when =
			months < 0
				? `was due to move up in ${monthYear(report.moveUpDate)}`
				: `moves up around ${monthYear(report.moveUpDate)} (${formatOneDecimal(months)} months)`;
		result.push(
			`${when[0].toUpperCase()}${when.slice(1)}, with ${outstanding} ${report.rules.peakAwardName} item${outstanding === 1 ? '' : 's'} outstanding.`
		);
	}
	const milestone = report.milestone;
	if (milestone?.isClose) {
		const remaining = milestoneRemaining(milestone);
		result.push(
			`${remaining} ${remaining === 1 ? 'activity' : 'activities'} from completing Milestone ${milestone.number}.`
		);
	}
	for (const stage of report.stages.filter((s) => s.isClose)) {
		const count = stage.remaining.length;
		result.push(
			`${count} ${count === 1 ? 'requirement' : 'requirements'} from finishing ${stage.streamDisplay} Stage ${stage.stage}.`
		);
	}
	if (milestone && !milestone.isClose) {
		const weakest = sortBy(milestone.participates, desc(needRemaining))[0];
		if (needRemaining(weakest) > 0)
			result.push(
				`Milestone ${milestone.number}: ${milestoneRemaining(milestone)} activities to go, most needed in ${weakest.challengeArea} (${needRemaining(weakest)}).`
			);
	}
	const recurring = report.themes.find((t) => t.stages.length > 1 && t.theme !== OTHER_THEME);
	if (recurring)
		result.push(`Recurring gap: ${recurring.theme} shows up in ${recurring.stages.join(' and ')}.`);
	else if (report.themes.length > 0)
		result.push(
			`Biggest gap: ${
				sortBy(
					report.themes,
					desc((t) => t.count)
				)[0].theme
			}.`
		);
	return result;
}
