import type { CalendarDate } from '../dates.js';
import { sum } from '../util.js';
import type { YouthProgress } from './progress.js';
import type { SectionRules } from './settings.js';

// Inputs

export interface YouthRecord {
	memberId: string;
	memberName: string;
	patrol: string;
	dateOfBirth: CalendarDate | null;
	progress: YouthProgress;
}

/** One OAS requirement for one member, flattened from the OAS worksheet answers */
export interface OASRequirementStatus {
	stream: string;
	stage: number;
	inputGroup: string;
	inputLabel: string;
	inputDetail?: string;
	memberId: string;
	answered: boolean;
}

// Outputs

export interface InsightsReport {
	generatedOn: CalendarDate;
	section: string;
	rules: SectionRules;
	youthCount: number;
	/** Lowest OAS stage shown; lower stages are left out of the report */
	minimumStage: number;
	maximumStage: number;
	memberNames: Record<string, string>;
	streamCoverage: StreamCoverage[];
	nextStageDemand: StageDemand[];
	requirementGaps: RequirementGap[];
	moveUpCandidates: MoveUpCandidate[];
	priorityTaskBoard: TaskSummary[];
	challengeAreaDeficits: ChallengeAreaDeficit[];
	skillThemes: SkillTheme[];
	suggestedNights: NightSuggestion[];
}

export interface StreamCoverage {
	stream: string;
	streamDisplay: string;
	isCore: boolean;
	notStarted: number;
	averageStage: number;
	highestStage: number;
	/** Index = stage (1..9), value = number of youth who have reached at least that stage */
	reachedStage: number[];
	/** Index = stage (1..9), value = youth whose lowest incomplete stage in the stream is that stage */
	nextStageMemberIds: string[][];
	/** Index = stage (1..9), value = youth who have started that stage in Terrain */
	workingOnMemberIds: string[][];
}

export interface StageDemand {
	stream: string;
	streamDisplay: string;
	stage: number;
	memberIds: string[];
	priorityMemberCount: number;
}

export interface RequirementGap {
	stream: string;
	streamDisplay: string;
	stage: number;
	inputGroup: string;
	inputLabel: string;
	inputDetail: string;
	theme: string;
	unitNightSuitable: boolean;
	/**
	 * Youth who haven't done this. All eligible youth (candidateCount) are those who have completed
	 * the stage, plus those who haven't and could get credit for it; only the second group can be outstanding.
	 */
	outstandingMemberIds: string[];
	candidateCount: number;
	completedCount: number;
	/** Outstanding youth who have started this stage in Terrain */
	activeOutstandingMemberIds: string[];
	activeCandidateCount: number;
	priorityMemberCount: number;
}

export const outstandingCount = (gap: RequirementGap) => gap.outstandingMemberIds.length;
export const activeOutstandingCount = (gap: RequirementGap) =>
	gap.activeOutstandingMemberIds.length;
export const outstandingPercent = (gap: RequirementGap) =>
	gap.candidateCount === 0 ? 0 : outstandingCount(gap) / gap.candidateCount;
export const activeOutstandingPercent = (gap: RequirementGap) =>
	gap.activeCandidateCount === 0 ? 0 : activeOutstandingCount(gap) / gap.activeCandidateCount;

export type Urgency = 'High' | 'Medium' | 'Low';
export const URGENCY_ORDER: Record<Urgency, number> = { High: 0, Medium: 1, Low: 2 };

export type TaskCategory = 'Introduction' | 'Milestone' | 'OAS' | 'SIA' | 'PeakAward';

export interface MoveUpCandidate {
	memberId: string;
	memberName: string;
	patrol: string;
	ageDisplay: string;
	/** Unknown when Terrain has no date of birth for the youth */
	moveUpDate: CalendarDate | null;
	monthsRemaining: number | null;
	/** Priority youth are those moving up soon plus any focus youth a leader picks */
	isMovingUp: boolean;
	isFocus: boolean;
	urgency: Urgency;
	priorityScore: number;
	tasks: PriorityTask[];
	/** Weighted peak award progress */
	peakAwardBreakdown: PeakAwardComponent[];
}

export const candidateOutstandingCount = (candidate: MoveUpCandidate) =>
	candidate.tasks.filter((t) => !t.done).length;

/** Peak award progress as a fraction of 1 */
export function completionPercent(candidate: MoveUpCandidate): number {
	if (candidate.peakAwardBreakdown.length > 0)
		return sum(candidate.peakAwardBreakdown.map((c) => c.earned)) / 100.0;
	if (candidate.tasks.length === 0) return 1;
	return candidate.tasks.filter((t) => t.done).length / candidate.tasks.length;
}

export interface PeakAwardComponent {
	name: string;
	earned: number;
	max: number;
}

export interface PriorityTask {
	category: TaskCategory;
	/** Stable key used to group the same task across youth, e.g. "peak:aj" */
	key: string;
	title: string;
	detail: string;
	done: boolean;
	unitNightSuitable: boolean;
}

export interface TaskSummary {
	key: string;
	category: TaskCategory;
	title: string;
	unitNightSuitable: boolean;
	memberNames: string[];
	highUrgencyCount: number;
}

export interface ChallengeAreaDeficit {
	challengeArea: string;
	participatesShort: number;
	youthShort: number;
}

export interface SkillTheme {
	name: string;
	description: string;
	outstandingRequirements: number;
	memberIds: string[];
	activeMemberIds: string[];
	priorityMemberCount: number;
	requirements: RequirementGap[];
}

export const skillThemeScore = (theme: SkillTheme) =>
	theme.memberIds.length +
	2 * theme.activeMemberIds.length +
	2 * theme.priorityMemberCount +
	0.25 * theme.outstandingRequirements;

export interface NightSuggestion {
	number: number;
	title: string;
	focus: string;
	challengeArea: string;
	covers: string[];
	memberNames: string[];
	priorityMemberCount: number;
}
