// Ported from the C# OASSignOffTests
import { describe, expect, it } from 'vitest';
import {
	forYouth,
	latestByMember,
	readyToSubmit,
	type UnitOASRecord
} from '#lib/model/oas/signOff.js';

const SELECTED = ['plan_a', 'do_b'];
const NOW = new Date().toISOString();

function record(
	memberId: string,
	status: string,
	lastUpdated: string,
	...done: string[]
): UnitOASRecord {
	return {
		id: `${memberId}-${status}`,
		member_id: memberId,
		status,
		last_updated: lastUpdated,
		achievement_meta: { stream: 'bushwalking', branch: 'bushwalking', stage: 2 },
		// Terrain's unit list as the C# app read it: answers as text
		answers: Object.fromEntries(done.map((id) => [id, 'True']))
	};
}

describe('OAS sign off', () => {
	it('is ready to submit only with every statement on an open stage', () => {
		const all = ['plan_a', 'do_b', 'logbook_up_to_date'];

		expect(readyToSubmit(record('y1', 'in_progress', NOW, ...all), all)).toBe(true);
		expect(readyToSubmit(record('y1', 'in_progress', NOW, 'plan_a', 'do_b'), all)).toBe(false);
		expect(readyToSubmit(record('y1', 'awarded', NOW, ...all), all)).toBe(false);
		expect(readyToSubmit(null, all)).toBe(false);
	});

	it('needs everything when not started', () => {
		const state = forYouth(null, SELECTED);

		expect(state.state).toBe('ToAdd');
		expect(state.toAddCount).toBe(2);
	});

	it('needs only what is missing when in progress', () => {
		const state = forYouth(record('y1', 'in_progress', NOW, 'plan_a'), SELECTED);

		expect(state.state).toBe('ToAdd');
		expect(state.toAddCount).toBe(1);
	});

	it('is done when everything is already there', () => {
		expect(forYouth(record('y1', 'feedback_review', NOW, 'plan_a', 'do_b'), SELECTED).state).toBe(
			'AlreadyDone'
		);
	});

	it('locks submitted or awarded stages', () => {
		for (const status of ['pending_review', 'pending_approval', 'approved', 'awarded']) {
			const state = forYouth(record('y1', status, NOW), SELECTED);
			expect(state.state, status).toBe('Locked');
			expect(state.status).toBe(status);
		}
	});

	it('prefers a completed record, then the newest, on the same branch', () => {
		const records = [
			record('y1', 'in_progress', '2026-10-01T00:00:00'),
			record('y1', 'awarded', '2025-01-01T00:00:00'),
			record('y2', 'in_progress', '2026-01-01T00:00:00'),
			record('y2', 'draft_review', '2026-09-01T00:00:00')
		];
		const other = record('y3', 'in_progress', NOW);
		other.achievement_meta.branch = 'other_branch';

		const latest = latestByMember([...records, other], 'bushwalking');

		expect(latest.get('y1')!.status).toBe('awarded');
		expect(latest.get('y2')!.status).toBe('draft_review');
		expect(latest.has('y3')).toBe(false);
	});
});
