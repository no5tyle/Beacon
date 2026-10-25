import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeOldYouthData } from '#lib/stores/storage.js';

function fakeStorage(entries: Record<string, string>) {
	const store = new Map(Object.entries(entries));
	return {
		store,
		get length() {
			return store.size;
		},
		key: (i: number) => [...store.keys()][i] ?? null,
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key)
	};
}

afterEach(() => vi.unstubAllGlobals());

describe('removing youth details older versions left on the device', () => {
	it('removes every unit’s approvals list and keeps Beacon’s preferences', () => {
		const storage = fakeStorage({
			'unit-1_ApprovalsList': '[{"member_first_name":"Ava"}]',
			'unit-2_ApprovalsList': '[]',
			LoginBranch: 'sa',
			'beacon-unit': 'unit-1',
			'topo-reference-starred': '[]'
		});
		vi.stubGlobal('localStorage', storage);

		expect(removeOldYouthData()).toBe(2);
		expect([...storage.store.keys()]).toEqual([
			'LoginBranch',
			'beacon-unit',
			'topo-reference-starred'
		]);
		expect(removeOldYouthData()).toBe(0);
	});

	it('does nothing when storage is unavailable', () => {
		vi.stubGlobal('localStorage', {
			get length(): number {
				throw new Error('blocked');
			}
		});
		expect(removeOldYouthData()).toBe(0);
	});
});
