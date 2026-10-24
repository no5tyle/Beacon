// Small preferences kept on this device. Storage can be unavailable (e.g. a private window), so every
// read and write is allowed to fail quietly; Beacon just doesn't remember the choice.

import { restoreInsightsSettings, type InsightsSettings } from '#lib/model/insights/settings.js';

export const BRANCH_KEY = 'LoginBranch';
export const UNIT_KEY = 'beacon-unit';
/** Focus youth picked on Insights, per unit, as the Blazor app kept them */
export const focusKey = (unitId: string) => `insights-focus-youth-${unitId}`;

/** The focus youth picked on Insights for a unit */
export function readFocusIds(unitId: string): string[] {
	try {
		const saved = JSON.parse(readSetting(focusKey(unitId)) || '[]') as unknown;
		return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
	} catch {
		return [];
	}
}

export function readSetting(key: string): string {
	try {
		return globalThis.localStorage?.getItem(key) ?? '';
	} catch {
		return '';
	}
}

export function writeSetting(key: string, value: string): void {
	try {
		globalThis.localStorage?.setItem(key, value);
	} catch {
		// Not remembered
	}
}

// Insights' filters last a browser tab, so Insights, a stage's analysis and youth details agree on who is
// moving up soon. Session storage, like local storage, can be unavailable; the defaults are used then.
const INSIGHTS_SETTINGS_KEY = 'beacon-insights-settings';

export function readInsightsSettings(): InsightsSettings {
	try {
		const saved = globalThis.sessionStorage?.getItem(INSIGHTS_SETTINGS_KEY);
		return restoreInsightsSettings(saved ? JSON.parse(saved) : null);
	} catch {
		return restoreInsightsSettings(null);
	}
}

export function saveInsightsSettings(settings: InsightsSettings): void {
	try {
		globalThis.sessionStorage?.setItem(INSIGHTS_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Not remembered
	}
}
