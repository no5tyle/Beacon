// Small preferences kept on this device. Storage can be unavailable (e.g. a private window), so every
// read and write is allowed to fail quietly; Beacon just doesn't remember the choice.

export const BRANCH_KEY = 'LoginBranch';
export const UNIT_KEY = 'beacon-unit';

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
