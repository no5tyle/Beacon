// One youth's progress for the Progress details page: milestones with their activities, OAS stages,
// logbook stats, SIA projects and peak award parts. Ported from Beacon's C# ProgressService.

import { today, toCalendarDate, type CalendarDate } from '#lib/model/dates.js';
import { emptyProgress, type YouthProgress } from '#lib/model/insights/progress.js';
import { STREAMS } from '#lib/model/insights/insightsCalculator.js';
import { asc, compareText, groupBy, sortBy, titleCase } from '#lib/model/util.js';
import type { TerrainAchievement } from '#lib/terrain/types.js';
import type { BeaconContext } from './context.js';
import type { MemberSummary, MembersService } from './members.js';

export interface MilestoneLog {
	/** community, creative, outdoors or personal_growth */
	challengeArea: string;
	eventName: string;
	eventDate: CalendarDate | null;
}

export type MilestoneStatus = 'Awarded' | 'Not Required' | 'In Progress' | 'Awaiting Review';

export interface MilestoneSummary {
	milestone: number;
	status: MilestoneStatus;
	awarded: CalendarDate | null;
	participateLogs: MilestoneLog[];
	assistLogs: MilestoneLog[];
	leadLogs: MilestoneLog[];
}

export interface OASSummary {
	stream: string;
	stage: number;
	awarded: CalendarDate | null;
	approved: CalendarDate | null;
	/** The first letter of the section the stage was done in, e.g. "s" */
	section: string;
	/** e.g. "oas/bushwalking/3" */
	template: string;
}

export interface Stats {
	oasProgressions: number;
	kmsHiked: number;
	nightsCamped: number;
	nightsCampedInSection: number;
}

export interface SIASummary {
	/** e.g. "Art Literature" */
	area: string;
	project: string;
	/** e.g. "Awarded", "In Progress" */
	status: string;
	updated: CalendarDate | null;
}

export interface PeakAwardSummary {
	personalDevelopmentCourse: CalendarDate | null;
	adventurousJourney: CalendarDate | null;
	personalReflection: CalendarDate | null;
	awarded: CalendarDate | null;
}

export interface ProgressDetails {
	member: MemberSummary;
	introToScouting: CalendarDate | null;
	introToSection: CalendarDate | null;
	milestones: MilestoneSummary[];
	oasSummaries: OASSummary[];
	stats: Stats;
	siaSummaries: SIASummary[];
	peakAward: PeakAwardSummary;
}

const dateOf = (value: unknown): CalendarDate | null =>
	typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? toCalendarDate(value) : null;
const importedDate = (record: TerrainAchievement) =>
	(record.imported as { date_awarded?: string } | undefined)?.date_awarded || '';
const awardedOn = (record: TerrainAchievement) =>
	dateOf(importedDate(record) || record.status_updated);

export { titleCase } from '#lib/model/util.js';

// Participates per challenge area, and leads, counted towards each milestone
const MILESTONE_COUNTS: Record<number, { participate: number; lead: number; total: number }> = {
	1: { participate: 6, lead: 2, total: 26 },
	2: { participate: 5, lead: 4, total: 24 },
	3: { participate: 4, lead: 6, total: 20 }
};

type EventCount = {
	community?: number;
	creative?: number;
	outdoors?: number;
	personal_growth?: number;
};
type EventLog = {
	credit_type: string;
	challenge_area: string;
	event_name: string;
	event_start_datetime: string;
};

export function milestoneSummaries(
	records: TerrainAchievement[],
	section: string
): MilestoneSummary[] {
	const result: MilestoneSummary[] = [];
	for (const record of sortBy(
		records.filter((r) => r.section === section),
		asc((r) => r.achievement_meta?.stage ?? 0)
	)) {
		const stage = record.achievement_meta?.stage ?? 0;
		const counts = MILESTONE_COUNTS[stage] ?? { participate: 0, lead: 0, total: -1 };
		const summary: MilestoneSummary = {
			milestone: stage,
			status:
				record.status === 'awarded'
					? 'Awarded'
					: record.status === 'not_required'
						? 'Not Required'
						: 'In Progress',
			awarded: record.status === 'awarded' ? awardedOn(record) : null,
			participateLogs: [],
			assistLogs: [],
			leadLogs: []
		};

		// Activities counted before Terrain, as one "Imported" entry each
		const imported = record.imported as
			| {
					date_awarded?: string;
					event_count?: { participant?: EventCount; assistant?: EventCount; leader?: EventCount };
			  }
			| undefined;
		if (imported) {
			const date = awardedOn(record);
			for (const area of ['community', 'creative', 'personal_growth', 'outdoors'] as const) {
				const add = (list: MilestoneLog[], count: number | undefined) => {
					for (let i = 0; i < Math.trunc(count ?? 0); i++)
						list.push({ challengeArea: area, eventName: 'Imported', eventDate: date });
				};
				add(summary.participateLogs, imported.event_count?.participant?.[area]);
				add(summary.assistLogs, imported.event_count?.assistant?.[area]);
				add(summary.leadLogs, imported.event_count?.leader?.[area]);
			}
		}

		const log = (record.event_log ?? []) as EventLog[];
		const byStart = (e: EventLog) => e.event_start_datetime ?? '';
		for (const group of groupBy(
			log.filter((e) => e.credit_type === 'participant'),
			(e) => e.challenge_area
		)) {
			for (const event of sortBy(group.items, asc(byStart)).slice(0, counts.participate))
				summary.participateLogs.push({
					challengeArea: event.challenge_area,
					eventName: event.event_name,
					eventDate: dateOf(event.event_start_datetime)
				});
		}
		const leads = log.filter((e) => e.credit_type === 'leader' || e.credit_type === 'assistant');
		for (const event of sortBy(leads, asc(byStart)).slice(0, counts.lead))
			summary.leadLogs.push({
				challengeArea: event.challenge_area,
				eventName: event.event_name,
				eventDate: dateOf(event.event_start_datetime)
			});

		const eventCount =
			summary.participateLogs.length + summary.assistLogs.length + summary.leadLogs.length;
		if (eventCount === counts.total && summary.status === 'In Progress')
			summary.status = 'Awaiting Review';
		result.push(summary);
	}
	return result;
}

/** The youth's OAS stages, and their stage progressions in the section (7 and above count twice) */
export function oasSummaries(
	records: TerrainAchievement[],
	section: string
): { summaries: OASSummary[]; progressions: number } {
	let progressions = 0;
	const summaries: OASSummary[] = [];
	const ordered = [...records].sort(
		(a, b) =>
			compareText(a.achievement_meta?.stream ?? '', b.achievement_meta?.stream ?? '') ||
			(a.achievement_meta?.stage ?? 0) - (b.achievement_meta?.stage ?? 0) ||
			compareText(a.status_updated ?? '', b.status_updated ?? '')
	);
	for (const record of ordered) {
		const stage = record.achievement_meta?.stage ?? 0;
		summaries.push({
			stream: record.achievement_meta?.stream ?? '',
			stage,
			awarded: record.status === 'awarded' ? awardedOn(record) : null,
			approved: record.status === 'approved' ? dateOf(record.status_updated) : null,
			section: (record.section ?? '').toLowerCase().slice(0, 1),
			template: record.template ?? ''
		});
		if (
			(record.status === 'awarded' || record.status === 'approved') &&
			(record.section ?? '').toLowerCase() === section.toLowerCase()
		) {
			progressions++;
			if (stage >= 7) progressions++;
		}
	}
	return { summaries, progressions };
}

export function siaSummaries(records: TerrainAchievement[], section: string): SIASummary[] {
	return records
		.filter((r) => r.section === section)
		.map((r) => ({
			area: titleCase(
				String(r.answers?.special_interest_area_selection ?? '')
					.replace('sia_', '')
					.replaceAll('_', ' ')
			),
			project: String(r.answers?.project_name ?? ''),
			status: titleCase(r.status.replaceAll('_', ' ')),
			updated: dateOf(r.status_updated)
		}));
}

/** Shapes the youth's progress like a unit progress row, so the unit level Insights can be reused */
export function progressFromDetails(details: ProgressDetails, section: string): YouthProgress {
	const member = details.member;
	const item = {
		...emptyProgress(member.id, `${member.firstName} ${member.lastName}`),
		memberPatrol: member.patrolName,
		introToScouting: details.introToScouting,
		introToSection: details.introToSection,
		oasStageProgressions: details.stats.oasProgressions,
		leadershipCourse: details.peakAward.personalDevelopmentCourse,
		adventurousJourney: details.peakAward.adventurousJourney,
		personalReflection: details.peakAward.personalReflection
	} as YouthProgress & Record<string, unknown>;

	for (const milestone of details.milestones) {
		const n = milestone.milestone;
		if (n < 1 || n > 3) continue;
		const count = (area: string) =>
			milestone.participateLogs.filter((l) => l.challengeArea === area).length;
		item[`milestone${n}Community`] = count('community');
		item[`milestone${n}Outdoors`] = count('outdoors');
		item[`milestone${n}Creative`] = count('creative');
		item[`milestone${n}PersonalGrowth`] = count('personal_growth');
		item[`milestone${n}Lead`] = milestone.leadLogs.length + milestone.assistLogs.length;
		item[`milestone${n}Awarded`] =
			milestone.status === 'Awarded' || milestone.status === 'Not Required'
				? (milestone.awarded ?? today())
				: null;
	}

	for (const stream of STREAMS) {
		const stages = details.oasSummaries
			.filter((o) => o.stream === stream.key && o.awarded)
			.map((o) => o.stage);
		const field = `oas${stream.display}Stage`;
		item[field] = stages.length > 0 ? Math.max(...stages) : 0;
	}
	item.oasStagesInProgress = [
		...new Set(
			details.oasSummaries
				.filter((o) => !o.awarded && !o.approved)
				.map((o) => `${o.stream}/${o.stage}`)
		)
	];
	const sectionInitial = section.toLowerCase().slice(0, 1);
	item.oasSectionStagesAwarded = details.oasSummaries
		.filter((o) => o.awarded && o.section === sectionInitial)
		.map((o) => o.stage);

	const awardedSia = details.siaSummaries.filter((s) => s.status === 'Awarded');
	const siaCount = (area: string) =>
		awardedSia.filter((s) => s.area.toLowerCase() === area.toLowerCase()).length;
	item.siaAdventureSport = siaCount('Adventure Sport');
	item.siaArtsLiterature = siaCount('Art Literature');
	item.siaEnvironment = siaCount('Environment');
	item.siaStemInnovation = siaCount('Stem Innovation');
	item.siaGrowthDevelopment = siaCount('Growth Development');
	item.siaCreatingABetterWorld = siaCount('Better World');
	return item;
}

export class ProgressService {
	constructor(
		private readonly context: BeaconContext,
		private readonly members: MembersService
	) {}

	async details(unitId: string, memberId: string): Promise<ProgressDetails> {
		const { terrain } = this.context;
		const section = this.context.sectionOf(unitId);
		const member = (await this.members.member(unitId, memberId)) ?? emptyMember(memberId);
		const [introScouting, introSection, milestones, oas] = await Promise.all([
			terrain.memberAchievements(memberId, 'intro_scouting'),
			terrain.memberAchievements(memberId, 'intro_section'),
			terrain.memberAchievements(memberId, 'milestone'),
			terrain.memberAchievements(memberId, 'outdoor_adventure_skill')
		]);
		const scouting = introScouting.find((r) => r.status === 'awarded');
		const sectionIntro = introSection.find((r) => r.section === section && r.status === 'awarded');
		const introToSection = sectionIntro ? awardedOn(sectionIntro) : null;
		const oasResult = oasSummaries(oas, section);

		// Terrain only gives the logbook to the youth themselves
		const logbook = await terrain.actAsYouth(memberId, (youth) => youth.logbookMetrics(memberId));
		const metrics = logbook.acted ? logbook.value : [];
		const nights = metrics.find((m) => m.name === 'total_nights_camped');
		const stats: Stats = {
			oasProgressions: oasResult.progressions,
			kmsHiked: Math.trunc(
				(metrics.find((m) => m.name === 'total_distance_hiked')?.value ?? 0) / 1000
			),
			nightsCamped: Math.trunc(nights?.value ?? 0),
			// The logbook total, if it was last updated since the youth started in the section
			nightsCampedInSection:
				nights && (dateOf(nights.last_updated) ?? '') >= (introToSection ?? '0000-01-01')
					? Math.trunc(nights.value)
					: 0
		};

		const [sia, course, journey, reflection, peak] = await Promise.all([
			terrain.memberAchievements(memberId, 'special_interest_area'),
			terrain.memberAchievements(memberId, 'course_reflection'),
			terrain.memberAchievements(memberId, 'adventurous_journey'),
			terrain.memberAchievements(memberId, 'personal_reflection'),
			terrain.memberAchievements(memberId, 'peak_award')
		]);
		const awardedIn = (list: TerrainAchievement[]) =>
			dateOf(list.find((r) => r.status === 'awarded' && r.section === section)?.status_updated);

		return {
			member,
			introToScouting: scouting ? awardedOn(scouting) : null,
			introToSection,
			milestones: milestoneSummaries(milestones, section),
			oasSummaries: oasResult.summaries,
			stats,
			siaSummaries: siaSummaries(sia, section),
			peakAward: {
				personalDevelopmentCourse: awardedIn(course),
				adventurousJourney: awardedIn(journey),
				personalReflection: awardedIn(reflection),
				awarded: awardedIn(peak)
			}
		};
	}
}

function emptyMember(id: string): MemberSummary {
	return {
		id,
		memberNumber: '',
		firstName: '',
		lastName: '',
		age: '',
		dateOfBirth: null,
		unitCouncil: false,
		patrolName: '',
		patrolDuty: '',
		patrolOrder: 3,
		isAdultLeader: false,
		status: ''
	};
}
