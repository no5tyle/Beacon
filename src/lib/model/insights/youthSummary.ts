// What the Progress and Patrols lists show for each youth from the unit's progress: their award
// percentage and logbook

import { peakAwardBreakdown } from './insightsCalculator.js';
import type { YouthProgress } from './progress.js';
import type { SectionRules } from './settings.js';

export interface YouthSummary {
	percent: number;
	nights: number;
	kms: number;
}

export function youthSummaries(
	progress: readonly YouthProgress[],
	rules: SectionRules
): Record<string, YouthSummary> {
	return Object.fromEntries(
		progress.map((p) => [
			p.memberId,
			{
				percent: Math.round(peakAwardBreakdown(p, rules).reduce((total, c) => total + c.earned, 0)),
				nights: p.nightsCamped,
				kms: p.kMsHiked
			}
		])
	);
}
