// Analysis of a unit's progress for the Insights page. Pure functions over data already loaded from
// Terrain, with no requests, so they can be tested against fixtures. Ported from Beacon's C# InsightsCalculator.

import { addMonths, daysBetween, wholeMonthsBetween, type CalendarDate } from '../dates.js';
import { asc, desc, distinct, groupBy, roundHalfEven, sortBy, sum } from '../util.js';
import {
	activeOutstandingCount,
	outstandingCount,
	skillThemeScore,
	URGENCY_ORDER,
	type ChallengeAreaDeficit,
	type InsightsReport,
	type MoveUpCandidate,
	type NightSuggestion,
	type OASRequirementStatus,
	type PeakAwardComponent,
	type PriorityTask,
	type RequirementGap,
	type SkillTheme,
	type StageDemand,
	type StreamCoverage,
	type TaskSummary,
	type Urgency,
	type YouthRecord
} from './models.js';
import type { YouthProgress } from './progress.js';
import {
	maximumStage,
	minimumStage,
	rulesFor,
	type InsightsSettings,
	type SectionRules
} from './settings.js';
import {
	challengeAreaFor,
	classify,
	descriptionFor,
	isUnitNightSuitable,
	normaliseGroup,
	OTHER_THEME
} from './skillThemes.js';

export interface StreamInfo {
	key: string;
	display: string;
	isCore: boolean;
}

export const STREAMS: StreamInfo[] = [
	{ key: 'bushcraft', display: 'Bushcraft', isCore: true },
	{ key: 'bushwalking', display: 'Bushwalking', isCore: true },
	{ key: 'camping', display: 'Camping', isCore: true },
	{ key: 'alpine', display: 'Alpine', isCore: false },
	{ key: 'cycling', display: 'Cycling', isCore: false },
	{ key: 'vertical', display: 'Vertical', isCore: false },
	{ key: 'aquatics', display: 'Aquatics', isCore: false },
	{ key: 'boating', display: 'Boating', isCore: false },
	{ key: 'paddling', display: 'Paddling', isCore: false }
];

export const MAX_STAGE = 9;

export const CHALLENGE_AREAS = ['Community', 'Outdoors', 'Creative', 'Personal Growth'];

/** Participates per challenge area and lead/assist count needed for each milestone (index = milestone) */
export const MILESTONE_REQUIREMENTS: { participate: number; leadAssist: number }[] = [
	{ participate: 0, leadAssist: 0 },
	{ participate: 6, leadAssist: 2 },
	{ participate: 5, leadAssist: 4 },
	{ participate: 4, leadAssist: 6 }
];

const coreStreams = () => STREAMS.filter((s) => s.isCore);
const streamsFor = (includeNonCore: boolean) => STREAMS.filter((s) => includeNonCore || s.isCore);

/** "stream/stage", e.g. "bushwalking/3", as Terrain progress lists stages in progress */
export const stageKey = (stream: string, stage: number) => `${stream}/${stage}`;

export function stageFor(progress: YouthProgress, stream: string): number {
	switch (stream) {
		case 'bushcraft':
			return progress.oasBushcraftStage;
		case 'bushwalking':
			return progress.oasBushwalkingStage;
		case 'camping':
			return progress.oasCampingStage;
		case 'alpine':
			return progress.oasAlpineStage;
		case 'cycling':
			return progress.oasCyclingStage;
		case 'vertical':
			return progress.oasVerticalStage;
		case 'aquatics':
			return progress.oasAquaticsStage;
		case 'boating':
			return progress.oasBoatingStage;
		case 'paddling':
			return progress.oasPaddlingStage;
		default:
			return 0;
	}
}

export function isCoreStream(stream: string): boolean {
	return STREAMS.some((s) => s.key === stream && s.isCore);
}

export function streamDisplay(stream: string): string {
	return STREAMS.find((s) => s.key === stream)?.display ?? stream;
}

export function buildInsights(
	section: string,
	youth: YouthRecord[],
	requirements: OASRequirementStatus[],
	settings: InsightsSettings,
	today: CalendarDate,
	focusIds?: ReadonlySet<string> | readonly string[]
): InsightsReport {
	const rules = rulesFor(settings, section);
	const minStage = minimumStage(settings, section);
	const highestStage = maximumStage(settings, section);
	if (!settings.includeNonCoreOAS)
		requirements = requirements.filter((r) => isCoreStream(r.stream));
	requirements = requirements.filter((r) => r.stage >= minStage && r.stage <= highestStage);
	const candidates = moveUpCandidates(youth, rules, settings, today, requirements, focusIds);
	const priorityIds = new Set(candidates.map((c) => c.memberId));
	const names: Record<string, string> = {};
	for (const y of youth) names[y.memberId] = y.memberName;

	const gaps = requirementGaps(youth, requirements, priorityIds);
	const deficits = challengeAreaDeficits(youth);
	const themes = skillThemes(gaps, priorityIds);

	return {
		generatedOn: today,
		section,
		rules,
		youthCount: youth.length,
		minimumStage: minStage,
		maximumStage: highestStage,
		memberNames: names,
		streamCoverage: streamCoverage(youth, settings.includeNonCoreOAS),
		nextStageDemand: nextStageDemand(
			youth,
			priorityIds,
			settings.includeNonCoreOAS,
			minStage,
			highestStage
		),
		requirementGaps: gaps,
		moveUpCandidates: candidates,
		priorityTaskBoard: priorityTaskBoard(candidates),
		challengeAreaDeficits: deficits,
		skillThemes: themes,
		suggestedNights: suggestNights(themes, deficits, candidates, names, settings.suggestedNights)
	};
}

// OAS trends

export function streamCoverage(youth: YouthRecord[], includeNonCore = false): StreamCoverage[] {
	return streamsFor(includeNonCore).map((stream) => {
		const stages = youth.map((y) => stageFor(y.progress, stream.key));
		const item: StreamCoverage = {
			stream: stream.key,
			streamDisplay: stream.display,
			isCore: stream.isCore,
			notStarted: stages.filter((s) => s === 0).length,
			averageStage: stages.length === 0 ? 0 : sum(stages) / stages.length,
			highestStage: stages.length === 0 ? 0 : Math.max(...stages),
			reachedStage: new Array<number>(MAX_STAGE + 1).fill(0),
			nextStageMemberIds: Array.from({ length: MAX_STAGE + 1 }, () => []),
			workingOnMemberIds: Array.from({ length: MAX_STAGE + 1 }, () => [])
		};
		for (let stage = 1; stage <= MAX_STAGE; stage++) {
			item.reachedStage[stage] = stages.filter((s) => s >= stage).length;
			item.nextStageMemberIds[stage] = youth
				.filter((y) => stageFor(y.progress, stream.key) === stage - 1)
				.map((y) => y.memberId);
			item.workingOnMemberIds[stage] = distinct(
				youth.filter((y) => isActivelyWorking(y.progress, stream.key, stage)).map((y) => y.memberId)
			);
		}
		return item;
	});
}

/**
 * The stage each youth would work on next, grouped. Core streams always count,
 * optional streams only once a youth has started them.
 */
export function nextStageDemand(
	youth: YouthRecord[],
	priorityIds: ReadonlySet<string>,
	includeNonCore = false,
	minStage = 1,
	highestStage = MAX_STAGE
): StageDemand[] {
	const demand = new Map<string, StageDemand>();
	for (const member of youth) {
		for (const stream of streamsFor(includeNonCore)) {
			const current = stageFor(member.progress, stream.key);
			if (
				current >= MAX_STAGE ||
				current + 1 < minStage ||
				current + 1 > highestStage ||
				(!stream.isCore && current === 0)
			)
				continue;
			const key = stageKey(stream.key, current + 1);
			let item = demand.get(key);
			if (!item) {
				item = {
					stream: stream.key,
					streamDisplay: stream.display,
					stage: current + 1,
					memberIds: [],
					priorityMemberCount: 0
				};
				demand.set(key, item);
			}
			item.memberIds.push(member.memberId);
			if (priorityIds.has(member.memberId)) item.priorityMemberCount++;
		}
	}
	return sortBy(
		[...demand.values()],
		desc((d) => d.priorityMemberCount * 2 + d.memberIds.length),
		asc((d) => d.stage)
	);
}

/** "bushwalking/3" → { stream: "bushwalking", stage: 3 }, or null if it isn't one */
function parseStageKey(key: string): { stream: string; stage: number } | null {
	const parts = key.split('/');
	if (parts.length !== 2 || !/^\s*[+-]?\d+\s*$/.test(parts[1])) return null;
	return { stream: parts[0], stage: Number(parts[1]) };
}

/**
 * Which stream/stages are worth fetching requirement detail for: stages youth are actively
 * working on and the most common next stages, plus every next core stage and started stage
 * of youth moving up soon.
 */
export function stagesForDetail(
	demand: StageDemand[],
	candidates: MoveUpCandidate[],
	youth: YouthRecord[],
	maxStages: number,
	includeNonCore = false,
	minStage = 1,
	highestStage = MAX_STAGE
): { stream: string; stage: number }[] {
	const scores = new Map<string, { stream: string; stage: number; score: number }>();
	for (const d of demand)
		scores.set(stageKey(d.stream, d.stage), {
			stream: d.stream,
			stage: d.stage,
			score: d.memberIds.length
		});
	for (const member of youth) {
		for (const parsed of member.progress.oasStagesInProgress.map(parseStageKey)) {
			if (!parsed) continue;
			if (
				(!includeNonCore && !isCoreStream(parsed.stream)) ||
				parsed.stage < minStage ||
				parsed.stage > highestStage
			)
				continue;
			const key = stageKey(parsed.stream, parsed.stage);
			const existing = scores.get(key);
			if (existing) existing.score += 3;
			else scores.set(key, { ...parsed, score: 3 });
		}
	}

	const selected = sortBy(
		[...scores.values()].filter((s) => s.stage >= minStage && s.stage <= highestStage),
		desc((s) => s.score),
		asc((s) => s.stage)
	)
		.slice(0, maxStages)
		.map((s) => ({ stream: s.stream, stage: s.stage }));
	const has = (stream: string, stage: number) =>
		selected.some((s) => s.stream === stream && s.stage === stage);

	const candidateIds = new Set(candidates.map((c) => c.memberId));
	for (const member of youth.filter((y) => candidateIds.has(y.memberId))) {
		const stages = [
			...coreStreams()
				.map((s) => ({ stream: s.key, stage: stageFor(member.progress, s.key) + 1 }))
				.filter((s) => s.stage <= MAX_STAGE),
			...member.progress.oasStagesInProgress.map(parseStageKey).filter((k) => k !== null)
		]
			.filter((s) => includeNonCore || isCoreStream(s.stream))
			.filter((s) => s.stage >= minStage && s.stage <= highestStage);
		for (const stage of stages) {
			if (!has(stage.stream, stage.stage)) selected.push(stage);
		}
	}
	return selected;
}

/**
 * Youth can work on several stages of a stream at once. Terrain gives credit for a stage
 * once the stage three below it is complete, so Stages 1 to 3 are open to everyone.
 */
export function isEligible(progress: YouthProgress, stream: string, stage: number): boolean {
	const highest = stageFor(progress, stream);
	return highest < stage && (stage <= 3 || highest >= stage - 3);
}

export function isActivelyWorking(progress: YouthProgress, stream: string, stage: number): boolean {
	return progress.oasStagesInProgress.includes(stageKey(stream, stage));
}

export function requirementGaps(
	youth: YouthRecord[],
	requirements: OASRequirementStatus[],
	priorityIds: ReadonlySet<string>
): RequirementGap[] {
	const progressById = new Map(youth.map((y) => [y.memberId, y.progress]));
	const completedCounts = new Map<string, number>();
	const completedFor = (stream: string, stage: number) => {
		const key = stageKey(stream, stage);
		let count = completedCounts.get(key);
		if (count === undefined) {
			count = youth.filter((y) => stageFor(y.progress, stream) >= stage).length;
			completedCounts.set(key, count);
		}
		return count;
	};

	const eligible = requirements
		.filter((r) => {
			const progress = progressById.get(r.memberId);
			return progress !== undefined && isEligible(progress, r.stream, r.stage);
		})
		.filter((r) => normaliseGroup(r.inputGroup) !== 'Verify');

	const gaps = groupBy(eligible, (r) => [
		r.stream,
		r.stage,
		normaliseGroup(r.inputGroup),
		r.inputLabel
	])
		.map(({ key: [stream, stage, group, inputLabel], items }): RequirementGap => {
			const s = stream as string;
			const n = stage as number;
			const g = group as string;
			const label = inputLabel as string;
			const outstanding = distinct(items.filter((r) => !r.answered).map((r) => r.memberId));
			const active = items.filter((r) =>
				isActivelyWorking(progressById.get(r.memberId)!, r.stream, r.stage)
			);
			return {
				stream: s,
				streamDisplay: streamDisplay(s),
				stage: n,
				inputGroup: g,
				inputLabel: label,
				inputDetail: items.map((r) => r.inputDetail ?? '').find((d) => d.trim() !== '') ?? '',
				theme: classify(g, label),
				unitNightSuitable: isUnitNightSuitable(g, label),
				// Youth who have completed the stage count towards the total as already done
				completedCount: completedFor(s, n),
				candidateCount: distinct(items.map((r) => r.memberId)).length + completedFor(s, n),
				outstandingMemberIds: outstanding,
				activeCandidateCount: distinct(active.map((r) => r.memberId)).length,
				activeOutstandingMemberIds: distinct(
					active.filter((r) => !r.answered).map((r) => r.memberId)
				),
				priorityMemberCount: outstanding.filter((id) => priorityIds.has(id)).length
			};
		})
		.filter((g) => outstandingCount(g) > 0);

	return sortBy(
		gaps,
		desc((g) => activeOutstandingCount(g) * 2 + g.priorityMemberCount * 2 + outstandingCount(g)),
		asc((g) => g.stream),
		asc((g) => g.stage)
	);
}

// Move up priorities

export function moveUpDate(dateOfBirth: CalendarDate, rules: SectionRules): CalendarDate {
	return addMonths(dateOfBirth, roundHalfEven(rules.moveUpAgeYears * 12));
}

/** Youth moving up within the window, plus any focus youth, who are weighted the same way */
export function moveUpCandidates(
	youth: YouthRecord[],
	rules: SectionRules,
	settings: InsightsSettings,
	today: CalendarDate,
	requirements: OASRequirementStatus[] = [],
	focusIds?: ReadonlySet<string> | readonly string[]
): MoveUpCandidate[] {
	const focus = new Set(focusIds ?? []);
	const candidates: MoveUpCandidate[] = [];
	for (const member of youth) {
		const moveUp = member.dateOfBirth ? moveUpDate(member.dateOfBirth, rules) : null;
		const monthsRemaining = moveUp ? daysBetween(today, moveUp) / 30.44 : null;
		const isMovingUp = monthsRemaining !== null && monthsRemaining <= settings.moveUpWindowMonths;
		const isFocus = focus.has(member.memberId);
		if (!isMovingUp && !isFocus) continue;

		// Focus youth who aren't moving up soon sit alongside the medium urgency group
		const urgency: Urgency = !isMovingUp
			? 'Medium'
			: monthsRemaining! <= 3
				? 'High'
				: monthsRemaining! <= 6
					? 'Medium'
					: 'Low';
		const tasks = peakAwardTasks(member, rules, requirements);
		const effectiveMonths = isMovingUp ? monthsRemaining! : settings.moveUpWindowMonths;
		candidates.push({
			memberId: member.memberId,
			memberName: member.memberName,
			patrol: member.patrol,
			ageDisplay: member.dateOfBirth ? ageDisplay(member.dateOfBirth, today) : '',
			moveUpDate: moveUp,
			monthsRemaining: monthsRemaining === null ? null : roundHalfEven(monthsRemaining, 1),
			isMovingUp,
			isFocus,
			urgency,
			priorityScore: roundHalfEven(outstandingWeight(tasks) / Math.max(effectiveMonths, 0.5), 2),
			tasks,
			peakAwardBreakdown: peakAwardBreakdown(member.progress, rules)
		});
	}
	return sortBy(
		candidates,
		asc((c) => URGENCY_ORDER[c.urgency]),
		desc((c) => c.priorityScore),
		asc((c) => c.monthsRemaining ?? Number.MAX_VALUE)
	);
}

const siaProjects = (p: YouthProgress) =>
	p.siaAdventureSport +
	p.siaArtsLiterature +
	p.siaEnvironment +
	p.siaStemInnovation +
	p.siaGrowthDevelopment +
	p.siaCreatingABetterWorld;

/**
 * Peak award progress out of 100 using Terrain's component weights, split further:
 * essentials give 9 per milestone awarded plus 3 shared by the two introductions, OAS is shared
 * equally across the stage progressions needed, SIA across the projects needed, and the
 * course, Adventurous Journey and Personal Reflection are all or nothing. No component goes
 * over its weight when a youth does more than is required.
 */
export function peakAwardBreakdown(p: YouthProgress, rules: SectionRules): PeakAwardComponent[] {
	const milestones = [p.milestone1Awarded, p.milestone2Awarded, p.milestone3Awarded].filter(
		(m) => m !== null
	).length;
	const intros = [p.introToScouting, p.introToSection].filter((i) => i !== null).length;
	const essentials = milestones * 9.0 + intros * 1.5;

	let oas: number;
	if (rules.oasStageProgressionsRequired > 0) {
		oas =
			(rules.oasWeight * Math.min(p.oasStageProgressions, rules.oasStageProgressionsRequired)) /
			rules.oasStageProgressionsRequired;
	} else {
		// Joeys: the stages needed are Stage 1 (or the core minimum) in each core stream
		const perStream = Math.max(rules.coreStageRequired, 1);
		const needed = coreStreams().length * perStream;
		const reached = sum(coreStreams().map((s) => Math.min(stageFor(p, s.key), perStream)));
		oas = (rules.oasWeight * reached) / needed;
	}

	const projects = siaProjects(p);
	const sia =
		rules.siaProjectsRequired > 0
			? (rules.siaWeight * Math.min(projects, rules.siaProjectsRequired)) /
				rules.siaProjectsRequired
			: 0;

	const components: PeakAwardComponent[] = [
		{
			name: 'Essentials',
			max: rules.essentialsWeight,
			earned: Math.min(essentials, rules.essentialsWeight)
		},
		{ name: 'OAS', max: rules.oasWeight, earned: Math.min(oas, rules.oasWeight) },
		{ name: 'SIA', max: rules.siaWeight, earned: Math.min(sia, rules.siaWeight) }
	];
	if (rules.personalDevelopmentCourseRequired && rules.courseWeight > 0)
		components.push({
			name: 'Personal development',
			max: rules.courseWeight,
			earned: p.leadershipCourse !== null ? rules.courseWeight : 0
		});
	components.push({
		name: 'Journey',
		max: rules.adventurousJourneyWeight,
		earned: p.adventurousJourney !== null ? rules.adventurousJourneyWeight : 0
	});
	components.push({
		name: 'Reflection',
		max: rules.reflectionWeight,
		earned: p.personalReflection !== null ? rules.reflectionWeight : 0
	});
	return components;
}

const task = (
	category: PriorityTask['category'],
	key: string,
	title: string,
	done: boolean,
	detail = '',
	unitNightSuitable = false
): PriorityTask => ({ category, key, title, detail, done, unitNightSuitable });

export function peakAwardTasks(
	member: YouthRecord,
	rules: SectionRules,
	requirements: OASRequirementStatus[]
): PriorityTask[] {
	const p = member.progress;
	const tasks: PriorityTask[] = [
		task(
			'Introduction',
			'intro:scouting',
			'Introduction to Scouting',
			p.introToScouting !== null,
			'',
			true
		),
		task(
			'Introduction',
			'intro:section',
			'Introduction to Section',
			p.introToSection !== null,
			'',
			true
		),
		task(
			'Milestone',
			'milestone',
			'Milestone 3',
			p.milestone3Awarded !== null,
			milestoneDetail(p),
			true
		)
	];

	const progressions = p.oasStageProgressions;
	if (rules.oasStageProgressionsRequired > 0) {
		tasks.push(
			task(
				'OAS',
				'oas',
				`${rules.oasStageProgressionsRequired} OAS stage progressions`,
				progressions >= rules.oasStageProgressionsRequired,
				`${progressions} of ${rules.oasStageProgressionsRequired}. ${closestStages(member, requirements)}`.trim()
			)
		);
	}

	if (rules.oasHighStageProgressionsRequired > 0) {
		const highStages = p.oasSectionStagesAwarded.filter(
			(stage) => stage >= rules.oasHighStage
		).length;
		tasks.push(
			task(
				'OAS',
				'oas:high',
				`${rules.oasHighStageProgressionsRequired} progressions at Stage ${rules.oasHighStage} or above`,
				highStages >= rules.oasHighStageProgressionsRequired,
				`${highStages} of ${rules.oasHighStageProgressionsRequired}`
			)
		);
	}

	if (rules.coreStageRequired > 0) {
		const below = coreStreams()
			.map((s) => ({ display: s.display, stage: stageFor(p, s.key) }))
			.filter((s) => s.stage < rules.coreStageRequired);
		tasks.push(
			task(
				'OAS',
				'oas:core',
				`Stage ${rules.coreStageRequired} in all core OAS`,
				below.length === 0,
				below.length > 0
					? `Below Stage ${rules.coreStageRequired}: ${below.map((b) => `${b.display} ${b.stage}`).join(', ')}`
					: ''
			)
		);
	}

	const siaCount = siaProjects(p);
	const siaAreas = [
		p.siaAdventureSport,
		p.siaArtsLiterature,
		p.siaEnvironment,
		p.siaStemInnovation,
		p.siaGrowthDevelopment,
		p.siaCreatingABetterWorld
	].filter((c) => c > 0).length;
	if (rules.siaProjectsRequired > 0) {
		tasks.push(
			task(
				'SIA',
				'sia',
				rules.siaAreasRequired > 1
					? `${rules.siaProjectsRequired} SIA projects across ${rules.siaAreasRequired} areas`
					: `${rules.siaProjectsRequired} SIA projects`,
				siaCount >= rules.siaProjectsRequired && siaAreas >= rules.siaAreasRequired,
				`${siaCount} of ${rules.siaProjectsRequired} projects, ${siaAreas} of ${rules.siaAreasRequired} areas`
			)
		);
	}

	if (rules.personalDevelopmentCourseRequired)
		tasks.push(
			task('PeakAward', 'peak:course', 'Personal development course', p.leadershipCourse !== null)
		);
	tasks.push(task('PeakAward', 'peak:aj', 'Adventurous Journey', p.adventurousJourney !== null));
	tasks.push(
		task(
			'PeakAward',
			'peak:reflection',
			'Personal Reflection',
			p.personalReflection !== null,
			'',
			true
		)
	);
	return tasks;
}

function milestoneDetail(p: YouthProgress): string {
	if (p.milestone3Awarded !== null) return '';
	const { number, counts, leadAssist } = currentMilestone(p);
	const need = MILESTONE_REQUIREMENTS[number];
	const shortfalls: string[] = [];
	CHALLENGE_AREAS.forEach((area, i) => {
		const shortBy = need.participate - counts[i];
		if (shortBy > 0) shortfalls.push(`${area} ${shortBy}`);
	});
	if (need.leadAssist - leadAssist > 0)
		shortfalls.push(`lead/assist ${need.leadAssist - leadAssist}`);
	const prefix = number < 3 ? `On Milestone ${number}` : 'Milestone 3';
	return shortfalls.length > 0
		? `${prefix}, needs ${shortfalls.join(', ')}`
		: `${prefix} ready for review`;
}

/** Milestone number in progress, participates per challenge area and lead/assist count */
export function currentMilestone(p: YouthProgress): {
	number: number;
	counts: number[];
	leadAssist: number;
} {
	if (p.milestone1Awarded === null)
		return {
			number: 1,
			counts: [
				p.milestone1Community,
				p.milestone1Outdoors,
				p.milestone1Creative,
				p.milestone1PersonalGrowth
			],
			leadAssist: p.milestone1Assist + p.milestone1Lead
		};
	if (p.milestone2Awarded === null)
		return {
			number: 2,
			counts: [
				p.milestone2Community,
				p.milestone2Outdoors,
				p.milestone2Creative,
				p.milestone2PersonalGrowth
			],
			leadAssist: p.milestone2Assist + p.milestone2Lead
		};
	return {
		number: 3,
		counts: [
			p.milestone3Community,
			p.milestone3Outdoors,
			p.milestone3Creative,
			p.milestone3PersonalGrowth
		],
		leadAssist: p.milestone3Assist + p.milestone3Lead
	};
}

/** Point the leader at the core stages this youth is closest to finishing */
function closestStages(member: YouthRecord, requirements: OASRequirementStatus[]): string {
	const options: { text: string; ratio: number }[] = [];
	for (const stream of coreStreams()) {
		const next = stageFor(member.progress, stream.key) + 1;
		if (next > MAX_STAGE) continue;
		const rows = requirements
			.filter((r) => r.memberId === member.memberId && r.stream === stream.key && r.stage === next)
			.filter((r) => normaliseGroup(r.inputGroup) !== 'Verify');
		if (rows.length > 0) {
			const done = rows.filter((r) => r.answered).length;
			options.push({
				text: `${stream.display} ${next} (${done}/${rows.length})`,
				ratio: done / rows.length
			});
		} else {
			options.push({ text: `${stream.display} ${next}`, ratio: -1 });
		}
	}
	const closest = sortBy(
		options,
		desc((o) => o.ratio)
	)
		.slice(0, 2)
		.map((o) => o.text);
	return `Closest: ${closest.join(', ')}`;
}

const TASK_WEIGHTS: Record<string, number> = {
	milestone: 3,
	oas: 2,
	'oas:core': 2,
	'oas:high': 1,
	sia: 2,
	'peak:aj': 3,
	'peak:course': 2
};

function outstandingWeight(tasks: PriorityTask[]): number {
	let weight = 0;
	for (const t of tasks.filter((t) => !t.done)) weight += TASK_WEIGHTS[t.key] ?? 1;
	return weight;
}

export function priorityTaskBoard(candidates: MoveUpCandidate[]): TaskSummary[] {
	const outstanding = candidates.flatMap((candidate) =>
		candidate.tasks.filter((t) => !t.done).map((t) => ({ candidate, task: t }))
	);
	const board = groupBy(outstanding, (x) => x.task.key).map(({ key, items }): TaskSummary => ({
		key,
		category: items[0].task.category,
		// OAS and SIA titles carry the target number, which is the same for everyone in the section
		title: items[0].task.title,
		unitNightSuitable: items[0].task.unitNightSuitable,
		memberNames: items.map((x) => x.candidate.memberName),
		highUrgencyCount: items.filter((x) => x.candidate.urgency === 'High').length
	}));
	return sortBy(
		board,
		desc((t) => t.highUrgencyCount),
		desc((t) => t.memberNames.length)
	);
}

// Programme patterns

export function challengeAreaDeficits(youth: YouthRecord[]): ChallengeAreaDeficit[] {
	const deficits = CHALLENGE_AREAS.map((area): ChallengeAreaDeficit => ({
		challengeArea: area,
		participatesShort: 0,
		youthShort: 0
	}));
	const leadAssist: ChallengeAreaDeficit = {
		challengeArea: 'Lead / Assist',
		participatesShort: 0,
		youthShort: 0
	};
	for (const member of youth.filter((y) => y.progress.milestone3Awarded === null)) {
		const { number, counts, leadAssist: la } = currentMilestone(member.progress);
		const need = MILESTONE_REQUIREMENTS[number];
		CHALLENGE_AREAS.forEach((_, i) => {
			const shortBy = need.participate - counts[i];
			if (shortBy > 0) {
				deficits[i].participatesShort += shortBy;
				deficits[i].youthShort++;
			}
		});
		if (need.leadAssist - la > 0) {
			leadAssist.participatesShort += need.leadAssist - la;
			leadAssist.youthShort++;
		}
	}
	deficits.push(leadAssist);
	return sortBy(
		deficits,
		desc((d) => d.participatesShort)
	);
}

const gapPriority = (r: RequirementGap) =>
	activeOutstandingCount(r) * 2 + r.priorityMemberCount * 2 + outstandingCount(r);

export function skillThemes(
	gaps: RequirementGap[],
	priorityIds: ReadonlySet<string>
): SkillTheme[] {
	const themes = groupBy(
		gaps.filter((g) => g.unitNightSuitable),
		(g) => g.theme
	).map(({ key, items }): SkillTheme => {
		const memberIds = distinct(items.flatMap((r) => r.outstandingMemberIds));
		return {
			name: key,
			description: descriptionFor(key),
			outstandingRequirements: sum(items.map(outstandingCount)),
			memberIds,
			activeMemberIds: distinct(items.flatMap((r) => r.activeOutstandingMemberIds)),
			priorityMemberCount: memberIds.filter((id) => priorityIds.has(id)).length,
			requirements: sortBy(items, desc(gapPriority))
		};
	});
	return sortBy(themes, desc(skillThemeScore));
}

export function suggestNights(
	themes: SkillTheme[],
	deficits: ChallengeAreaDeficit[],
	candidates: MoveUpCandidate[],
	names: Record<string, string>,
	count: number
): NightSuggestion[] {
	const nights: NightSuggestion[] = [];
	const priorityIds = new Set(candidates.map((c) => c.memberId));

	for (const theme of themes
		.filter((t) => t.name !== OTHER_THEME)
		.slice(0, Math.max(count - 1, 1))) {
		nights.push({
			number: 0,
			title: `${theme.name} night`,
			focus: theme.description,
			challengeArea: challengeAreaFor(theme.name),
			covers: theme.requirements
				.slice(0, 4)
				.map(
					(r) => `${r.streamDisplay} ${r.stage}: ${r.inputLabel} (${outstandingCount(r)} youth)`
				),
			memberNames: sortBy(
				theme.memberIds.map((id) => names[id] ?? id),
				asc((n) => n)
			),
			priorityMemberCount: theme.memberIds.filter((id) => priorityIds.has(id)).length
		});
	}

	// Balance the programme towards the challenge area youth are most short of for milestones
	const gap = deficits.find((d) => d.challengeArea !== 'Lead / Assist' && d.participatesShort > 0);
	const leadGap = deficits.find((d) => d.challengeArea === 'Lead / Assist');
	if (gap && nights.length < count) {
		let focus = `${gap.youthShort} youth are short ${gap.participatesShort} ${gap.challengeArea} participates for their current milestone.`;
		if (leadGap && leadGap.youthShort > 0)
			focus += ` Give lead/assist roles to the ${leadGap.youthShort} youth who need them.`;
		nights.push({
			number: 0,
			title: `${gap.challengeArea} challenge night`,
			focus,
			challengeArea: gap.challengeArea,
			covers: [],
			memberNames: [],
			priorityMemberCount: 0
		});
	}

	nights.forEach((night, i) => (night.number = i + 1));
	return nights;
}

function ageDisplay(dateOfBirth: CalendarDate, today: CalendarDate): string {
	const months = wholeMonthsBetween(dateOfBirth, today);
	return `${Math.trunc(months / 12)}y ${months % 12}m`;
}
