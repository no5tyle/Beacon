// Every youth's progress in a unit (milestones, OAS, SIAs, introductions, peak award and logbook), loaded
// from Terrain one youth at a time. It's slow, so it is remembered per unit, and a load already under way
// is shared rather than started twice. Ported from Beacon's C# WallchartService.

import { toCalendarDate, type CalendarDate } from '#lib/model/dates.js';
import { emptyProgress, type YouthProgress } from '#lib/model/insights/progress.js';
import { asc, sortBy } from '#lib/model/util.js';
import type { TerrainAchievement } from '#lib/terrain/types.js';
import type { BeaconContext } from './context.js';
import type { MemberSummary, MembersService } from './members.js';

/** One youth's records from Terrain, as the unit progress is built from them */
export interface YouthRecords {
	milestones: TerrainAchievement[];
	oas: TerrainAchievement[];
	sia: TerrainAchievement[];
	introScouting: TerrainAchievement[];
	introSection: TerrainAchievement[];
	courseReflection: TerrainAchievement[];
	adventurousJourney: TerrainAchievement[];
	personalReflection: TerrainAchievement[];
	logbook: { name: string; value: number }[];
}

type EventCount = {
	community?: number;
	creative?: number;
	outdoors?: number;
	personal_growth?: number;
};
type EventCounts = { participant?: EventCount; assistant?: EventCount; leader?: EventCount };

const total = (count: EventCount | undefined) =>
	Math.trunc(
		(count?.community ?? 0) +
			(count?.creative ?? 0) +
			(count?.outdoors ?? 0) +
			(count?.personal_growth ?? 0)
	);

const dateOf = (value: unknown): CalendarDate | null =>
	typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? toCalendarDate(value) : null;

/** When an introduction was done: the imported date if it came from the old system, else when it was awarded */
function introDate(record: TerrainAchievement | undefined): CalendarDate | null {
	if (!record) return null;
	const imported = (record.imported as { date_awarded?: string } | undefined)?.date_awarded;
	return imported ? dateOf(imported) : dateOf(record.status_updated);
}

const IN_PROGRESS = ['in_progress', 'draft_review', 'feedback_review'];

const SIA_AREAS: Record<string, keyof YouthProgress> = {
	sia_adventure_sport: 'siaAdventureSport',
	sia_art_literature: 'siaArtsLiterature',
	sia_environment: 'siaEnvironment',
	sia_stem_innovation: 'siaStemInnovation',
	sia_growth_development: 'siaGrowthDevelopment',
	sia_better_world: 'siaCreatingABetterWorld'
};

const OAS_FIELDS: Record<string, keyof YouthProgress> = {
	bushcraft: 'oasBushcraftStage',
	bushwalking: 'oasBushwalkingStage',
	camping: 'oasCampingStage',
	alpine: 'oasAlpineStage',
	cycling: 'oasCyclingStage',
	vertical: 'oasVerticalStage',
	aquatics: 'oasAquaticsStage',
	boating: 'oasBoatingStage',
	paddling: 'oasPaddlingStage'
};

/** One youth's progress in the section, from their Terrain records */
export function youthProgress(
	member: MemberSummary,
	displayName: string,
	records: YouthRecords,
	section: string
): YouthProgress {
	const p = emptyProgress(member.id, displayName) as YouthProgress & Record<string, unknown>;
	p.memberPatrol = member.patrolName;

	const milestones = sortBy(
		records.milestones.filter((r) => r.section === section),
		asc((r) => r.achievement_meta?.stage ?? 0)
	);
	for (const milestone of milestones) {
		const counts = (milestone.event_count ?? {}) as EventCounts;
		const participant = counts.participant ?? {};
		// Assisting counts as leading towards a milestone, so assists are added to leads
		const leads = total(counts.leader) + total(counts.assistant);
		const awarded = milestone.status === 'awarded';
		const stage = milestone.achievement_meta?.stage;
		const fromCounts = (n: 1 | 2 | 3) => {
			p[`milestone${n}Community`] = Math.trunc(participant.community ?? 0);
			p[`milestone${n}Creative`] = Math.trunc(participant.creative ?? 0);
			p[`milestone${n}Outdoors`] = Math.trunc(participant.outdoors ?? 0);
			p[`milestone${n}PersonalGrowth`] = Math.trunc(participant.personal_growth ?? 0);
			p[`milestone${n}Assist`] = 0;
			p[`milestone${n}Lead`] = leads;
		};
		const full = (n: 1 | 2, participate: number, lead: number) => {
			p[`milestone${n}Community`] = participate;
			p[`milestone${n}Creative`] = participate;
			p[`milestone${n}Outdoors`] = participate;
			p[`milestone${n}PersonalGrowth`] = participate;
			p[`milestone${n}Assist`] = 0;
			p[`milestone${n}Lead`] = lead;
			p[`milestone${n}Awarded`] = dateOf(milestone.status_updated);
		};
		if (stage === 1) {
			if (awarded) full(1, 6, 2);
			else fromCounts(1);
		} else if (stage === 2) {
			if (awarded) full(2, 5, 4);
			else fromCounts(2);
		} else if (stage === 3) {
			fromCounts(3);
			p.milestone3Awarded = awarded ? dateOf(milestone.status_updated) : null;
		}
	}

	const awardedOAS = records.oas.filter((o) => o.status === 'awarded');
	for (const o of awardedOAS) {
		const field = OAS_FIELDS[o.achievement_meta?.stream ?? ''];
		if (field) p[field as string] = Math.max(p[field] as number, o.achievement_meta?.stage ?? 0);
	}
	const inSection = awardedOAS.filter((o) => o.section === section);
	p.oasSectionStagesAwarded = inSection.map((o) => o.achievement_meta?.stage ?? 0);
	// Stages 7 and above count as two progressions
	p.oasStageProgressions =
		inSection.length + inSection.filter((o) => (o.achievement_meta?.stage ?? 0) >= 7).length;
	p.oasStagesInProgress = [
		...new Set(
			records.oas
				.filter((o) => IN_PROGRESS.includes(o.status))
				.map((o) => `${o.achievement_meta?.stream}/${o.achievement_meta?.stage}`)
		)
	];

	p.introToScouting = introDate(records.introScouting.find((r) => r.status === 'awarded'));
	p.introToSection = introDate(
		records.introSection.find((r) => r.section === section && r.status === 'awarded')
	);

	const metric = (name: string) => records.logbook.find((m) => m.name === name)?.value ?? 0;
	p.nightsCamped = Math.trunc(metric('total_nights_camped'));
	p.nightsCampedInSection = p.nightsCamped;
	p.kMsHiked = Math.trunc(metric('total_distance_hiked') / 1000);

	for (const project of records.sia.filter(
		(r) => r.section === section && r.status === 'awarded'
	)) {
		const area = (project.answers?.special_interest_area_selection as string | undefined) ?? '';
		const field = SIA_AREAS[area];
		if (field) (p[field] as number)++;
	}

	const awardedIn = (list: TerrainAchievement[]) =>
		dateOf(list.find((r) => r.status === 'awarded' && r.section === section)?.status_updated);
	p.leadershipCourse = awardedIn(records.courseReflection);
	p.adventurousJourney = awardedIn(records.adventurousJourney);
	p.personalReflection = awardedIn(records.personalReflection);
	p.peakAward = 0;
	return p;
}

export interface LoadProgress {
	done: number;
	total: number;
}

export class UnitProgressService {
	private readonly cache = new Map<string, YouthProgress[]>();
	private readonly loading = new Map<string, Promise<YouthProgress[]>>();
	private readonly progress = new Map<string, LoadProgress>();
	private readonly listeners = new Set<() => void>();
	/** Moves on whenever everything is forgotten, so a load started before then keeps nothing */
	private generation = 0;

	constructor(
		private readonly context: BeaconContext,
		private readonly members: MembersService
	) {}

	isCached(unitId: string): boolean {
		return this.cache.has(unitId);
	}

	isLoading(unitId: string): boolean {
		return this.loading.has(unitId);
	}

	loadProgress(unitId: string): LoadProgress {
		return this.progress.get(unitId) ?? { done: 0, total: 0 };
	}

	/** Called whenever a load moves on a youth, e.g. to update a progress bar */
	onProgress(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Every youth's progress in the unit, loading it if it isn't already remembered or loading */
	async get(unitId: string): Promise<YouthProgress[]> {
		const cached = this.cache.get(unitId);
		if (cached) {
			// Names follow the current "hide last names" setting
			const members = await this.members.get(unitId);
			for (const item of cached) {
				const member = members.find((m) => m.id === item.memberId);
				item.memberName = `${member?.firstName ?? ''} ${this.members.lastName(member)}`;
			}
			return cached;
		}
		let load = this.loading.get(unitId);
		if (!load) {
			const started = this.load(unitId);
			load = started.finally(() => {
				if (this.loading.get(unitId) === load) this.loading.delete(unitId);
			});
			this.loading.set(unitId, load);
		}
		return load;
	}

	/** Forgets a unit, e.g. after a save, so its progress is loaded again */
	clear(unitId?: string): void {
		if (unitId !== undefined) {
			this.cache.delete(unitId);
			return;
		}
		this.cache.clear();
		this.loading.clear();
		this.progress.clear();
		this.generation++;
	}

	private setProgress(unitId: string, done: number, totalCount: number) {
		this.progress.set(unitId, { done, total: totalCount });
		this.listeners.forEach((listener) => listener());
	}

	private async load(unitId: string): Promise<YouthProgress[]> {
		const { terrain } = this.context;
		const generation = this.generation;
		const section = this.context.sectionOf(unitId);
		const members = await this.members.get(unitId);
		const youth = sortBy(
			members.filter((m) => !m.isAdultLeader),
			asc((m) => m.lastName),
			asc((m) => m.firstName)
		);
		this.setProgress(unitId, 0, youth.length);

		const items: YouthProgress[] = [];
		for (const member of youth) {
			// Stop if the leader logs out (or someone else logs in) part way through
			if (!this.context.isSignedIn || generation !== this.generation)
				throw new Error('Logged out while loading the unit');
			const [milestones, oas, introScouting, introSection] = await Promise.all([
				terrain.memberAchievements(member.id, 'milestone'),
				terrain.memberAchievements(member.id, 'outdoor_adventure_skill'),
				terrain.memberAchievements(member.id, 'intro_scouting'),
				terrain.memberAchievements(member.id, 'intro_section')
			]);
			// Terrain only gives the logbook to the youth themselves
			const logbook = await terrain.actAsYouth(member.id, (asYouth) =>
				asYouth.logbookMetrics(member.id).catch(() => [])
			);
			const [sia, courseReflection, adventurousJourney, personalReflection] = await Promise.all([
				terrain.memberAchievements(member.id, 'special_interest_area'),
				terrain.memberAchievements(member.id, 'course_reflection'),
				terrain.memberAchievements(member.id, 'adventurous_journey'),
				terrain.memberAchievements(member.id, 'personal_reflection')
			]);
			const records: YouthRecords = {
				milestones,
				oas,
				sia,
				introScouting,
				introSection,
				courseReflection,
				adventurousJourney,
				personalReflection,
				logbook: logbook.acted ? logbook.value : []
			};
			items.push(
				youthProgress(
					member,
					`${member.firstName} ${this.members.lastName(member)}`,
					records,
					section
				)
			);
			this.setProgress(unitId, items.length, youth.length);
		}
		if (generation !== this.generation) throw new Error('Logged out while loading the unit');
		this.cache.set(unitId, items);
		return items;
	}
}
