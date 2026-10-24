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
