// Small helpers that give the same results as the C# (LINQ and .NET) code Beacon's logic was ported from

/** Sort key: a number, a string (compared like .NET's culture-aware ordering) or a boolean (false first) */
type SortValue = number | string | boolean;

export interface SortKey<T> {
	key: (item: T) => SortValue;
	descending?: boolean;
}

export const asc = <T>(key: (item: T) => SortValue): SortKey<T> => ({ key });
export const desc = <T>(key: (item: T) => SortValue): SortKey<T> => ({ key, descending: true });

/** Text ordering like .NET's default string comparer (culture-aware, via ICU) */
export function compareText(a: string, b: string): number {
	return a.localeCompare(b, 'en');
}

function compareValues(a: SortValue, b: SortValue): number {
	if (typeof a === 'string' && typeof b === 'string') return compareText(a, b);
	const x = Number(a);
	const y = Number(b);
	return x < y ? -1 : x > y ? 1 : 0;
}

/** A sorted copy, like LINQ's OrderBy(...).ThenBy(...): stable, by each key in turn */
export function sortBy<T>(items: readonly T[], ...keys: SortKey<T>[]): T[] {
	return [...items].sort((a, b) => {
		for (const { key, descending } of keys) {
			const result = compareValues(key(a), key(b));
			if (result !== 0) return descending ? -result : result;
		}
		return 0;
	});
}

/** Groups in order of first appearance, like LINQ's GroupBy */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): { key: K; items: T[] }[] {
	const groups = new Map<string, { key: K; items: T[] }>();
	for (const item of items) {
		const k = key(item);
		const id = JSON.stringify(k);
		let group = groups.get(id);
		if (!group) {
			group = { key: k, items: [] };
			groups.set(id, group);
		}
		group.items.push(item);
	}
	return [...groups.values()];
}

/** Distinct values in order of first appearance, like LINQ's Distinct */
export function distinct<T>(items: readonly T[]): T[] {
	return [...new Set(items)];
}

/** The first item for each key, in order of first appearance, like LINQ's DistinctBy */
export function distinctBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
	const seen = new Set<K>();
	return items.filter((item) => {
		const k = key(item);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

export function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

/** Rounds like .NET's Math.Round(value, digits): halves go to the even digit */
export function roundHalfEven(value: number, digits = 0): number {
	const power = 10 ** digits;
	const scaled = value * power;
	const floor = Math.floor(scaled);
	const fraction = scaled - floor;
	const rounded =
		fraction > 0.5 ? floor + 1 : fraction < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
	return rounded / power;
}

/** Formats like .NET's "0.#": at most one decimal place, without a trailing ".0" */
export function formatOneDecimal(value: number): string {
	const text = value.toFixed(1);
	return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** Case-insensitive "contains", like .NET's Contains(text, StringComparison.OrdinalIgnoreCase) */
export function containsIgnoreCase(text: string, part: string): boolean {
	return text.toLowerCase().includes(part.toLowerCase());
}

/** Like .NET's TextInfo.ToTitleCase: each word capitalised, except words already in capitals, e.g. "OAS" */
export function titleCase(text: string): string {
	return text
		.split(' ')
		.map((word) =>
			word === word.toUpperCase()
				? word
				: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
		)
		.join(' ');
}
