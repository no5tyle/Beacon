// Small preferences kept on this device. Storage can be unavailable (e.g. a private window), so every
// read and write is allowed to fail quietly; Beacon just doesn't remember the choice.

import { DEFAULT_TIMES, isDayTimes, type DayTimes } from '#lib/model/activity.js';
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

// The times of the last one-day activity logged, so the next one starts with them
const ACTIVITY_TIMES_KEY = 'beacon-activity-times';

export function readActivityTimes(): DayTimes {
	try {
		const saved = JSON.parse(readSetting(ACTIVITY_TIMES_KEY) || 'null') as unknown;
		return isDayTimes(saved) ? saved : DEFAULT_TIMES;
	} catch {
		return DEFAULT_TIMES;
	}
}

export function writeActivityTimes(times: DayTimes): void {
	if (isDayTimes(times)) writeSetting(ACTIVITY_TIMES_KEY, JSON.stringify(times));
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

// Older versions of the Blazor app kept each unit's approvals list, with youth names and achievements, in
// local storage as "{unitId}_ApprovalsList", and never removed it. Both apps share no5tyle.github.io's storage,
// so Beacon removes any it finds: nothing about youth members is kept on the device.
const OLD_YOUTH_DATA = /_ApprovalsList$/;

/** Removes youth details older Beacon versions left on this device. Returns how many entries went */
export function removeOldYouthData(): number {
	try {
		const storage = globalThis.localStorage;
		if (!storage) return 0;
		const keys: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key && OLD_YOUTH_DATA.test(key)) keys.push(key);
		}
		for (const key of keys) storage.removeItem(key);
		return keys.length;
	} catch {
		return 0;
	}
}
