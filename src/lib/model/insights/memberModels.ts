import type { CalendarDate } from '../dates.js';
import { sum } from '../util.js';
import type { PeakAwardComponent, PriorityTask } from './models.js';
import type { SectionRules } from './settings.js';

export interface MemberInsightsReport {
	rules: SectionRules;
	moveUpDate: CalendarDate | null;
	monthsToMoveUp: number | null;
	highlights: string[];
	peakAwardTasks: PriorityTask[];
	peakAwardBreakdown: PeakAwardComponent[];
	milestone: MilestoneProgress | null;
	stages: StageProgress[];
	themes: MemberThemeGap[];
	closeToComplete: ActivitySuggestion[];
}

export const peakAwardPercent = (report: MemberInsightsReport) =>
	sum(report.peakAwardBreakdown.map((c) => c.earned));

export interface ChallengeAreaNeed {
	challengeArea: string;
	have: number;
	need: number;
}

export const needRemaining = (need: ChallengeAreaNeed) => Math.max(need.need - need.have, 0);

export interface MilestoneProgress {
	number: number;
	participates: ChallengeAreaNeed[];
	leadAssist: ChallengeAreaNeed;
	isClose: boolean;
}

export const milestoneRemaining = (m: MilestoneProgress) =>
	sum(m.participates.map(needRemaining)) + needRemaining(m.leadAssist);
export const milestoneTotal = (m: MilestoneProgress) =>
	sum(m.participates.map((p) => p.need)) + m.leadAssist.need;

export interface StageProgress {
	stream: string;
	streamDisplay: string;
	stage: number;
	started: boolean;
	done: number;
	total: number;
	remaining: RemainingRequirement[];
	isClose: boolean;
}

export const percentDone = (stage: StageProgress) =>
	stage.total === 0 ? 0 : stage.done / stage.total;

export interface RemainingRequirement {
	inputGroup: string;
	inputLabel: string;
	theme: string;
	unitNightSuitable: boolean;
}

export interface MemberThemeGap {
	theme: string;
	description: string;
	count: number;
	stages: string[];
	unitNightSuitable: boolean;
}

export interface ActivityStep {
	phase: string;
	items: string[];
}

export interface ActivitySuggestion {
	kind: string;
	target: string;
	title: string;
	summary: string;
	coversAll: boolean;
	steps: ActivityStep[];
	notes: string[];
}
