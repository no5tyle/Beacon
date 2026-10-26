import { describe, expect, it } from 'vitest';
import {
	activityProblems,
	attendanceSummary,
	hasLogbook,
	logbookOf,
	newActivity,
	nightsBetween,
	withType
} from './activity.js';
import { addDays } from './dates.js';
import { newSIAPlan, siaAreaName, siaPlanProblems } from './siaPlan.js';

describe('logging an activity', () => {
	it('suits the times and logbook to the type', () => {
		const night = newActivity('Unit night', '2026-10-23');
		expect([night.startTime, night.endTime, night.endDate, night.nights]).toEqual([
			'19:00',
			'21:00',
			'2026-10-23',
			0
		]);
		const camp = withType(night, 'Camp');
		expect([camp.endDate, camp.nights]).toEqual(['2026-10-25', 2]);
		expect(withType(camp, 'Hike')).toMatchObject({ endDate: '2026-10-23', nights: 0 });
		expect(hasLogbook('Unit night')).toBe(false);
		expect(hasLogbook('Camp')).toBe(true);
	});

	it('counts nights away, never below none', () => {
		expect(nightsBetween('2026-10-23', '2026-10-25')).toBe(2);
		expect(nightsBetween('2026-10-25', '2026-10-23')).toBe(0);
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});

	it('gives each youth everyone’s logbook figures unless theirs differ', () => {
		const camp = { ...withType(newActivity('Camp', '2026-10-23'), 'Camp'), kilometres: 5 };
		camp.logbookFor = { m2: { nights: 1, kilometres: 5 } };
		expect(logbookOf(camp, 'm1')).toEqual({ nights: 2, kilometres: 5 });
		expect(logbookOf(camp, 'm2')).toEqual({ nights: 1, kilometres: 5 });
	});

	it('says what’s missing, in the order the form asks', () => {
		const draft = newActivity('Unit night', '2026-10-23');
		expect(activityProblems(draft)).toEqual([
			'Give the activity a title.',
			'Choose a challenge area.',
			'Tick who came.'
		]);
		const done = {
			...draft,
			title: 'Knots night',
			challengeArea: 'Outdoors' as const,
			attendance: { m1: 'Participant' as const }
		};
		expect(activityProblems(done)).toEqual([]);
		expect(activityProblems({ ...done, endTime: '18:00' })).toEqual([
			'It needs to end after it starts.'
		]);
	});

	it('sums up who came in each role', () => {
		expect(
			attendanceSummary({ a: 'Participant', b: 'Participant', c: 'Assistant', d: 'Leader' })
		).toBe('2 participants, 1 assistant, 1 leader');
		expect(attendanceSummary({})).toBe('');
	});
});

describe('an SIA plan', () => {
	it('says what’s missing, and names the areas as Terrain does', () => {
		expect(siaPlanProblems(newSIAPlan())).toEqual([
			'Choose the youth whose plan it is.',
			'Choose the special interest area.',
			'Give the project a name.'
		]);
		expect(
			siaPlanProblems({ memberId: 'm1', area: 'sia_art_literature', projectName: 'Puppets' })
		).toEqual([]);
		expect(siaAreaName('sia_better_world')).toBe('Creating a Better World');
	});
});
