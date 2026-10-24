// Small preferences kept on this device. Storage can be unavailable (e.g. a private window), so every
// read and write is allowed to fail quietly; Beacon just doesn't remember the choice.

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
