// What a printed progress report includes. The leader ticks the parts they want; the choice is kept on
// the device for next time. Nothing about any youth is kept, so notes written on a report are not.

export interface ReportOptions {
	/** The award, milestone, nights camped and km hiked at the top */
	summary: boolean;
	/** What they're working towards next */
	nextSteps: boolean;
	milestones: boolean;
	/** The section's award, item by item */
	award: boolean;
	/** Their OAS stages */
	oas: boolean;
	/** Under each OAS stage, the "I can" statements they've achieved */
	achievedStatements: boolean;
	/** Under each OAS stage, the statements still to do */
	notYetStatements: boolean;
	/** The non-core streams as well as Bushcraft, Bushwalking and Camping */
	nonCoreOAS: boolean;
	sia: boolean;
	logbook: boolean;
	/** A space for a note from the leader */
	note: boolean;
	/** Lines for the leader's and a parent's signature */
	signatures: boolean;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
	summary: true,
	nextSteps: true,
	milestones: true,
	award: true,
	oas: true,
	achievedStatements: false,
	notYetStatements: false,
	nonCoreOAS: false,
	sia: true,
	logbook: true,
	note: true,
	signatures: false
};

/** Saved options, with anything missing or not a yes/no taken from the defaults */
export function restoreReportOptions(saved: unknown): ReportOptions {
	const options = { ...DEFAULT_REPORT_OPTIONS };
	if (saved && typeof saved === 'object')
		for (const key of Object.keys(options) as (keyof ReportOptions)[]) {
			const value = (saved as Record<string, unknown>)[key];
			if (typeof value === 'boolean') options[key] = value;
		}
	return options;
}
