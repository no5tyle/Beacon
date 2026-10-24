import type { CalendarDate } from '../dates.js';

/**
 * One youth's progress across Terrain: introductions, milestones, OAS stages, SIAs and the peak award.
 * Dates are when each was awarded or completed, or null when it hasn't been.
 */
export interface YouthProgress {
	memberName: string;
	memberId: string;
	memberPatrol: string;
	introToScouting: CalendarDate | null;
	introToSection: CalendarDate | null;
	milestone1Community: number;
	milestone1Outdoors: number;
	milestone1Creative: number;
	milestone1PersonalGrowth: number;
	milestone1Assist: number;
	milestone1Lead: number;
	milestone1Awarded: CalendarDate | null;
	milestone1Presented: CalendarDate | null;
	milestone2Community: number;
	milestone2Outdoors: number;
	milestone2Creative: number;
	milestone2PersonalGrowth: number;
	milestone2Assist: number;
	milestone2Lead: number;
	milestone2Awarded: CalendarDate | null;
	milestone2Presented: CalendarDate | null;
	milestone3Community: number;
	milestone3Outdoors: number;
	milestone3Creative: number;
	milestone3PersonalGrowth: number;
	milestone3Assist: number;
	milestone3Lead: number;
	milestone3Awarded: CalendarDate | null;
	milestone3Presented: CalendarDate | null;
	oasBushcraftStage: number;
	oasBushwalkingStage: number;
	oasCampingStage: number;
	oasAlpineStage: number;
	oasCyclingStage: number;
	oasVerticalStage: number;
	oasAquaticsStage: number;
	oasBoatingStage: number;
	oasPaddlingStage: number;
	nightsCamped: number;
	nightsCampedInSection: number;
	kMsHiked: number;
	oasStageProgressions: number;
	/** Stage numbers of each OAS stage awarded while in the current section */
	oasSectionStagesAwarded: number[];
	/** OAS stages started in Terrain but not yet submitted, as "stream/stage" e.g. "bushwalking/3" */
	oasStagesInProgress: string[];
	siaAdventureSport: number;
	siaArtsLiterature: number;
	siaEnvironment: number;
	siaStemInnovation: number;
	siaGrowthDevelopment: number;
	siaCreatingABetterWorld: number;
	leadershipCourse: CalendarDate | null;
	adventurousJourney: CalendarDate | null;
	personalReflection: CalendarDate | null;
	peakAward: number;
}

/** A youth with nothing recorded, to fill in from Terrain */
export function emptyProgress(memberId = '', memberName = ''): YouthProgress {
	return {
		memberName,
		memberId,
		memberPatrol: '',
		introToScouting: null,
		introToSection: null,
		milestone1Community: 0,
		milestone1Outdoors: 0,
		milestone1Creative: 0,
		milestone1PersonalGrowth: 0,
		milestone1Assist: 0,
		milestone1Lead: 0,
		milestone1Awarded: null,
		milestone1Presented: null,
		milestone2Community: 0,
		milestone2Outdoors: 0,
		milestone2Creative: 0,
		milestone2PersonalGrowth: 0,
		milestone2Assist: 0,
		milestone2Lead: 0,
		milestone2Awarded: null,
		milestone2Presented: null,
		milestone3Community: 0,
		milestone3Outdoors: 0,
		milestone3Creative: 0,
		milestone3PersonalGrowth: 0,
		milestone3Assist: 0,
		milestone3Lead: 0,
		milestone3Awarded: null,
		milestone3Presented: null,
		oasBushcraftStage: 0,
		oasBushwalkingStage: 0,
		oasCampingStage: 0,
		oasAlpineStage: 0,
		oasCyclingStage: 0,
		oasVerticalStage: 0,
		oasAquaticsStage: 0,
		oasBoatingStage: 0,
		oasPaddlingStage: 0,
		nightsCamped: 0,
		nightsCampedInSection: 0,
		kMsHiked: 0,
		oasStageProgressions: 0,
		oasSectionStagesAwarded: [],
		oasStagesInProgress: [],
		siaAdventureSport: 0,
		siaArtsLiterature: 0,
		siaEnvironment: 0,
		siaStemInnovation: 0,
		siaGrowthDevelopment: 0,
		siaCreatingABetterWorld: 0,
		leadershipCourse: null,
		adventurousJourney: null,
		personalReflection: null,
		peakAward: 0
	};
}
