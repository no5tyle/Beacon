import { describe, expect, it } from 'vitest';
import {
	activityProblems,
	attendanceSummary,
	eventBody,
	hasLogbook,
	isOver,
	logbookOf,
	newActivity,
	nightsBetween,
	reviewProblems,
	terrainDateTime,
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
		const before = new Date(2026, 9, 1);
		expect(activityProblems(draft, before)).toEqual([
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
		expect(activityProblems(done, before)).toEqual([]);
		expect(activityProblems({ ...done, endTime: '18:00' }, before)).toEqual([
			'It needs to end after it starts.'
		]);
	});

	it('needs a review once it’s over, as Terrain concludes it', () => {
		const draft = {
			...newActivity('Unit night', '2026-10-23'),
			title: 'Knots night',
			challengeArea: 'Outdoors' as const,
			attendance: { m1: 'Participant' as const }
		};
		const during = new Date(2026, 9, 23, 20, 0);
		const after = new Date(2026, 9, 23, 21, 0);
		expect(isOver(draft, during)).toBe(false);
		expect(isOver(draft, after)).toBe(true);
		expect(activityProblems(draft, after)).toEqual([
			'Say how it went.',
			'Tick the Scout method it used.',
			'Tick the SPICES it developed.'
		]);
		const reviewed = {
			...draft,
			review: {
				rating: 'great' as const,
				tags: [],
				method: ['learn_by_doing'],
				spices: ['social']
			}
		};
		expect(reviewProblems(reviewed.review)).toEqual([]);
		expect(activityProblems(reviewed, after)).toEqual([]);
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

describe('the activity Terrain is sent', () => {
	const context = {
		unitId: 'unit-1',
		organiserId: 'leader-1',
		verifierName: 'Sam Leader',
		timeZone: 'Australia/Adelaide'
	};
	const draft = () => ({
		...newActivity('Unit night', '2026-10-26'),
		title: ' Test Activity ',
		startTime: '18:00',
		endTime: '19:30',
		challengeArea: 'Community' as const,
		location: 'Strath',
		attendance: { y1: 'Leader' as const, y2: 'Participant' as const, y3: 'Assistant' as const }
	});

	it('has the same shape as Terrain’s own activity planner sends', () => {
		const body = eventBody(draft(), context);
		expect(Object.keys(body)).toEqual([
			'title',
			'description',
			'justification',
			'organisers',
			'challenge_area',
			'start_datetime',
			'end_datetime',
			'event_type',
			'attendance',
			'schedule_items',
			'achievement_pathway_oas_data',
			'achievement_pathway_logbook_data',
			'review',
			'uploads',
			'equipment_notes',
			'additional_notes',
			'location',
			'iana_timezone',
			'status'
		]);
		expect(body).toMatchObject({
			title: 'Test Activity',
			organisers: ['leader-1'],
			challenge_area: 'community',
			event_type: { type: 'unit', id: 'unit-1' },
			attendance: {
				leader_member_ids: ['y1'],
				assistant_member_ids: ['y3'],
				attendee_member_ids: ['y1', 'y2', 'y3'],
				participant_member_ids: ['y2']
			},
			achievement_pathway_oas_data: {
				award_rule: 'individual',
				verifier: { name: 'Sam Leader', contact: '', type: 'member' },
				groups: []
			},
			location: 'Strath',
			iana_timezone: 'Australia/Adelaide',
			status: 'planned'
		});
		expect(eventBody({ ...draft(), challengeArea: 'Personal growth' }, context)).toMatchObject({
			challenge_area: 'personal_growth'
		});
	});

	it('concludes it with its review, as Terrain’s planner does', () => {
		const reviewed = {
			...draft(),
			review: {
				rating: 'great' as const,
				tags: ['adventurous', 'fun'],
				method: ['community_involvement'],
				spices: ['social', 'physical']
			}
		};
		const body = eventBody(reviewed, context, 'concluded');
		expect(body).toMatchObject({
			status: 'concluded',
			review: {
				general_tags: ['fun', 'adventurous'],
				scout_method_elements: ['community_involvement'],
				scout_spices_elements: ['social', 'physical'],
				general_rating: 'great'
			},
			achievement_pathway_logbook_data: { title: '' }
		});
		// Planned, it has no review yet
		expect(eventBody(reviewed, context)).toMatchObject({
			status: 'planned',
			review: { scout_method_elements: [], scout_spices_elements: [] }
		});
		expect(eventBody(reviewed, context).achievement_pathway_logbook_data).not.toHaveProperty(
			'title'
		);
	});

	it('sends times in UTC, as Terrain does', () => {
		expect(terrainDateTime('2026-10-26', '18:00')).toBe(
			new Date(2026, 9, 26, 18, 0).toISOString().replace('Z', '+00:00')
		);
		expect(terrainDateTime('2026-10-26', '18:00')).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000\+00:00$/
		);
	});
});
