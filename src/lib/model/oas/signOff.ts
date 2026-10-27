// Signing off the same "I" statements for several youth at once, e.g. after a unit night activity.
// Ported from Beacon's C# OASSignOff.

import { desc, groupBy, sortBy } from '../util.js';
import { isTrue, type Answers } from './answers.js';
import { isEditable } from './recording.js';

/** A youth's record for a stage, from Terrain's unit achievements list */
export interface UnitOASRecord {
	id: string;
	member_id: string;
	status: string;
	last_updated?: string | null;
	achievement_meta: { stream: string; branch: string; stage: number };
	answers: Answers;
}

export type SignOffState = 'ToAdd' | 'AlreadyDone' | 'Locked';

export interface YouthSignOff {
	state: SignOffState;
	status: string;
	toAddCount: number;
}

export type SignOffOutcomeState = 'Waiting' | 'Saving' | 'Saved' | 'Skipped' | 'Failed';

export interface SignOffOutcome {
	state: SignOffOutcomeState;
	savedCount: number;
	message: string;
}

const isDone = (record: UnitOASRecord | null | undefined, inputId: string) =>
	record != null && isTrue(record.answers?.[inputId]);

/** Where a youth stands for the chosen statements, from the unit's records for the stage */
export function forYouth(
	record: UnitOASRecord | null | undefined,
	selectedInputIds: readonly string[]
): YouthSignOff {
	const status = record?.status ?? '';
	if (!isEditable(status)) return { state: 'Locked', status, toAddCount: 0 };
	const toAdd = selectedInputIds.filter((id) => !isDone(record, id)).length;
	return { state: toAdd === 0 ? 'AlreadyDone' : 'ToAdd', status, toAddCount: toAdd };
}

/** An in progress stage with every statement ticked, including the logbook, can go to the Unit Council */
export function readyToSubmit(
	record: UnitOASRecord | null | undefined,
	allInputIds: readonly string[]
): boolean {
	return (
		record != null &&
		isEditable(record.status) &&
		allInputIds.length > 0 &&
		allInputIds.every((id) => isDone(record, id))
	);
}

const lastUpdated = (record: UnitOASRecord) =>
	record.last_updated ? Date.parse(record.last_updated) || 0 : 0;

/** The record to use for each youth: a completed one if there is one, otherwise the latest */
export function latestByMember(
	records: readonly UnitOASRecord[],
	branch: string
): Map<string, UnitOASRecord> {
	const latest = new Map<string, UnitOASRecord>();
	const matching = records.filter((r) => !branch || r.achievement_meta.branch === branch);
	for (const { key, items } of groupBy(matching, (r) => r.member_id)) {
		const best = sortBy(
			items,
			desc((r) => r.status === 'awarded' || r.status === 'approved'),
			desc(lastUpdated)
		)[0];
		latest.set(key, best);
	}
	return latest;
}

/** Where a youth stands across several stages: something to add on any of them makes them pickable */
export function forYouthAcrossStages(stages: readonly YouthSignOff[]): YouthSignOff {
	const toAdd = stages.filter((s) => s.state === 'ToAdd');
	if (toAdd.length > 0)
		return { state: 'ToAdd', status: '', toAddCount: toAdd.reduce((n, s) => n + s.toAddCount, 0) };
	const locked = stages.find((s) => s.state === 'Locked');
	if (locked && stages.every((s) => s.state === 'Locked')) return locked;
	return {
		state: stages.length === 0 ? 'Locked' : 'AlreadyDone',
		status: locked?.status ?? '',
		toAddCount: 0
	};
}

/** One youth's outcome from saving several stages: any failure shows, naming its stage when there are several */
export function combineOutcomes(
	results: readonly { name: string; outcome: SignOffOutcome }[]
): SignOffOutcome {
	if (results.length === 1) return results[0].outcome;
	const savedCount = results.reduce((n, r) => n + r.outcome.savedCount, 0);
	const failed = results.filter((r) => r.outcome.state === 'Failed');
	if (failed.length > 0) {
		const saved = savedCount > 0 ? `Saved ${savedCount}, but ` : '';
		return {
			state: 'Failed',
			savedCount,
			message: saved + failed.map((r) => `${r.name}: ${r.outcome.message}`).join(' ')
		};
	}
	if (savedCount > 0) return { state: 'Saved', savedCount, message: '' };
	return { state: 'Skipped', savedCount: 0, message: results[0]?.outcome.message ?? '' };
}
