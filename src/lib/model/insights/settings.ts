export interface SectionRules {
	section: string;
	sectionDisplay: string;
	peakAwardName: string;
	/** Age the youth is expected to link to the next section (or age out) */
	moveUpAgeYears: number;
	oasStageProgressionsRequired: number;
	/** Lowest stage the youth must have reached in each core stream (Bushcraft, Bushwalking, Camping) */
	coreStageRequired: number;
	/** Venturers and Rovers: this many of the section's progressions must be at oasHighStage or above */
	oasHighStageProgressionsRequired: number;
	oasHighStage: number;
	siaProjectsRequired: number;
	/** SIA projects must cover at least this many different Special Interest Areas */
	siaAreasRequired: number;
	/** Joeys have no personal development course */
	personalDevelopmentCourseRequired: boolean;
	/** Peak award progress weights out of 100, as Terrain's peak award page uses them */
	essentialsWeight: number;
	oasWeight: number;
	siaWeight: number;
	courseWeight: number;
	adventurousJourneyWeight: number;
	reflectionWeight: number;
	/** OAS stages Insights shows when limited to the section's usual stages */
	lowestStageShown: number;
	highestStageShown: number;
}

function rules(overrides: Partial<SectionRules>): SectionRules {
	return {
		section: '',
		sectionDisplay: '',
		peakAwardName: 'Peak Award',
		moveUpAgeYears: 0,
		oasStageProgressionsRequired: 0,
		coreStageRequired: 0,
		oasHighStageProgressionsRequired: 0,
		oasHighStage: 0,
		siaProjectsRequired: 0,
		siaAreasRequired: 0,
		personalDevelopmentCourseRequired: true,
		essentialsWeight: 30,
		oasWeight: 30,
		siaWeight: 25,
		courseWeight: 5,
		adventurousJourneyWeight: 8,
		reflectionWeight: 2,
		lowestStageShown: 1,
		highestStageShown: 9,
		...overrides
	};
}

/**
 * Peak award names, OAS and SIA requirements follow the peak award wording in Terrain. The move up
 * age defaults are a starting point only and are editable on the Insights page.
 */
export function defaultSectionRules(): SectionRules[] {
	return [
		rules({
			section: 'joey',
			sectionDisplay: 'Joey Scouts',
			peakAwardName: 'Joey Scout Challenge Award',
			moveUpAgeYears: 8,
			oasStageProgressionsRequired: 0,
			coreStageRequired: 1,
			siaProjectsRequired: 6,
			siaAreasRequired: 2,
			personalDevelopmentCourseRequired: false,
			lowestStageShown: 1,
			highestStageShown: 1,
			siaWeight: 28,
			courseWeight: 0,
			adventurousJourneyWeight: 9,
			reflectionWeight: 3
		}),
		rules({
			section: 'cub',
			sectionDisplay: 'Cub Scouts',
			peakAwardName: 'Grey Wolf Award',
			moveUpAgeYears: 11,
			oasStageProgressionsRequired: 8,
			coreStageRequired: 3,
			siaProjectsRequired: 6,
			siaAreasRequired: 2,
			lowestStageShown: 2,
			highestStageShown: 3
		}),
		rules({
			section: 'scout',
			sectionDisplay: 'Scouts',
			peakAwardName: 'Australian Scout Award',
			moveUpAgeYears: 15,
			oasStageProgressionsRequired: 10,
			coreStageRequired: 5,
			siaProjectsRequired: 6,
			siaAreasRequired: 3,
			lowestStageShown: 4,
			highestStageShown: 5
		}),
		rules({
			section: 'venturer',
			sectionDisplay: 'Venturer Scouts',
			peakAwardName: "King's Scout Award",
			moveUpAgeYears: 18,
			oasStageProgressionsRequired: 12,
			coreStageRequired: 5,
			oasHighStageProgressionsRequired: 4,
			oasHighStage: 4,
			siaProjectsRequired: 6,
			siaAreasRequired: 3,
			lowestStageShown: 5,
			highestStageShown: 7
		}),
		rules({
			section: 'rover',
			sectionDisplay: 'Rover Scouts',
			peakAwardName: 'Baden-Powell Scout Award',
			moveUpAgeYears: 26,
			oasStageProgressionsRequired: 14,
			coreStageRequired: 5,
			oasHighStageProgressionsRequired: 6,
			oasHighStage: 4,
			siaProjectsRequired: 6,
			siaAreasRequired: 4,
			lowestStageShown: 5,
			highestStageShown: 9
		})
	];
}

export interface InsightsSettings {
	/** Youth whose move-up date falls inside this window are treated as "moving up soon" */
	moveUpWindowMonths: number;
	/** How many of the most in-demand OAS stages to pull requirement level detail for */
	maxGapStages: number;
	suggestedNights: number;
	/**
	 * Insights cover the core OAS streams only (bushcraft, bushwalking, camping) unless asked for.
	 * Peak award stage progression counts always include every stream.
	 */
	includeNonCoreOAS: boolean;
	/** Only show the OAS stages the section typically works on, e.g. Stages 2 and 3 for Cubs */
	sectionStagesOnly: boolean;
	sections: SectionRules[];
}

export function defaultInsightsSettings(
	overrides: Partial<InsightsSettings> = {}
): InsightsSettings {
	return {
		moveUpWindowMonths: 6,
		maxGapStages: 8,
		suggestedNights: 6,
		includeNonCoreOAS: false,
		sectionStagesOnly: true,
		sections: defaultSectionRules(),
		...overrides
	};
}

/**
 * Settings saved earlier, e.g. in session storage, laid over the defaults. Anything missing, of the wrong
 * type or from an older version of Beacon falls back to its default, so a bad saved copy can't break Insights.
 */
export function restoreInsightsSettings(saved: unknown): InsightsSettings {
	const defaults = defaultInsightsSettings();
	if (typeof saved !== 'object' || saved === null) return defaults;
	const copy = <T extends object>(base: T, from: Record<string, unknown>): T => {
		const result = { ...base };
		for (const key of Object.keys(base) as (keyof T & string)[]) {
			const value = from[key];
			const kind = typeof base[key];
			if (
				(kind === 'number' && Number.isFinite(value)) ||
				(kind !== 'number' && typeof value === kind)
			)
				result[key] = value as T[typeof key];
		}
		return result;
	};
	const from = saved as Record<string, unknown>;
	const settings = copy({ ...defaults, sections: [] as SectionRules[] }, from);
	const savedSections = Array.isArray(from.sections) ? (from.sections as unknown[]) : [];
	settings.sections = defaults.sections.map((section) => {
		const match = savedSections.find(
			(s): s is Record<string, unknown> =>
				typeof s === 'object' && s !== null && (s as SectionRules).section === section.section
		);
		return match ? copy(section, match) : section;
	});
	return settings;
}

export function rulesFor(settings: InsightsSettings, section: string): SectionRules {
	return (
		settings.sections.find((s) => s.section === section) ?? rules({ section, moveUpAgeYears: 99 })
	);
}

export function minimumStage(settings: InsightsSettings, section: string): number {
	return settings.sectionStagesOnly ? Math.max(1, rulesFor(settings, section).lowestStageShown) : 1;
}

export function maximumStage(settings: InsightsSettings, section: string): number {
	if (!settings.sectionStagesOnly) return 9;
	const lowest = minimumStage(settings, section);
	return Math.min(Math.max(rulesFor(settings, section).highestStageShown, lowest), 9);
}
