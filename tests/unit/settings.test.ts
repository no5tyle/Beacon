import { describe, expect, it } from 'vitest';
import {
	defaultInsightsSettings,
	restoreInsightsSettings,
	rulesFor
} from '#lib/model/insights/settings.js';

describe('restoring saved Insights settings', () => {
	it('gives the defaults when nothing is saved', () => {
		expect(restoreInsightsSettings(null)).toEqual(defaultInsightsSettings());
		expect(restoreInsightsSettings('not settings')).toEqual(defaultInsightsSettings());
	});

	it('keeps what was saved, including edited section rules', () => {
		const saved = defaultInsightsSettings({ moveUpWindowMonths: 3, includeNonCoreOAS: true });
		rulesFor(saved, 'scout').moveUpAgeYears = 14.5;
		const restored = restoreInsightsSettings(JSON.parse(JSON.stringify(saved)));
		expect(restored).toEqual(saved);
		expect(rulesFor(restored, 'scout').moveUpAgeYears).toBe(14.5);
	});

	it('falls back to the default for anything missing or of the wrong type', () => {
		const restored = restoreInsightsSettings({
			moveUpWindowMonths: 'six',
			maxGapStages: null,
			sectionStagesOnly: false,
			sections: [{ section: 'cub', lowestStageShown: 'x', highestStageShown: 4 }, 'junk']
		});
		const defaults = defaultInsightsSettings();
		expect(restored.moveUpWindowMonths).toBe(defaults.moveUpWindowMonths);
		expect(restored.maxGapStages).toBe(defaults.maxGapStages);
		expect(restored.sectionStagesOnly).toBe(false);
		expect(rulesFor(restored, 'cub').lowestStageShown).toBe(
			rulesFor(defaults, 'cub').lowestStageShown
		);
		expect(rulesFor(restored, 'cub').highestStageShown).toBe(4);
		// Every section is still there, saved or not
		expect(restored.sections.map((s) => s.section)).toEqual(
			defaults.sections.map((s) => s.section)
		);
	});
});
