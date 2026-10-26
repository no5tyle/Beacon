import { describe, expect, it } from 'vitest';
import {
	activityProblems,
	attendanceSummary,
	eventBody,
	finishedBy,
	isDayTimes,
	isOver,
	logbookData,
	NOT_OVER,
	newActivity,
	nightsBetween,
	nightsCamped,
	nightsOf,
	reviewProblems,
	terrainDateTime,
	withMultiDay
} from './activity.js';
import { addDays } from './dates.js';
import { newSIAPlan, siaAreaName, siaPlanProblems } from './siaPlan.js';

describe('logging an activity', () => {
	it('starts on today with the last times used, or yesterday if they’re still to come', () => {
		const evening = new Date(2026, 9, 26, 22, 0);
		const morning = new Date(2026, 9, 26, 9, 0);
		// Until one's been logged, an evening at the hall
		expect(newActivity(undefined, evening)).toMatchObject({
			multiDay: false,
			startDate: '2026-10-26',
			startTime: '19:00',
			endDate: '2026-10-26',
			endTime: '21:00'
		});
		expect(newActivity(undefined, morning)).toMatchObject({
			startDate: '2026-10-25',
			endDate: '2026-10-25'
		});
		// The last times used: a morning activity already over today is today's
		const times = { start: '07:00', end: '08:30' };
		expect(newActivity(undefined, morning, times)).toMatchObject({
			startDate: '2026-10-26',
			startTime: '07:00',
			endTime: '08:30'
		});
		expect(nightsOf(newActivity(undefined, evening))).toBe(0);
	});

	it('over more than one day is yesterday midday to midday today, or a day earlier before midday', () => {
		const afternoon = new Date(2026, 9, 26, 15, 0);
		const morning = new Date(2026, 9, 26, 9, 0);
		const night = newActivity('2026-10-20');
		expect(withMultiDay(night, true, afternoon)).toMatchObject({
			multiDay: true,
			startDate: '2026-10-25',
			startTime: '12:00',
			endDate: '2026-10-26',
			endTime: '12:00'
		});
		expect(withMultiDay(night, true, morning)).toMatchObject({
			startDate: '2026-10-24',
			endDate: '2026-10-25'
		});
		expect(nightsOf(withMultiDay(night, true, afternoon))).toBe(1);
		// Back to one day: today with the last times used, or yesterday
		const times = { start: '18:30', end: '20:00' };
		expect(
			withMultiDay(withMultiDay(night, true, afternoon), false, afternoon, times)
		).toMatchObject({
			multiDay: false,
			startDate: '2026-10-25',
			startTime: '18:30',
			endDate: '2026-10-25',
			endTime: '20:00'
		});
	});

	it('only takes times as a time input gives them, ending after they start', () => {
		expect(isDayTimes({ start: '18:30', end: '20:00' })).toBe(true);
		expect(isDayTimes({ start: '20:00', end: '18:30' })).toBe(false);
		expect(isDayTimes({ start: '7pm', end: '9pm' })).toBe(false);
		expect(isDayTimes(null)).toBe(false);
		expect(isDayTimes('19:00')).toBe(false);
	});

	it('counts nights away, never below none', () => {
		expect(nightsBetween('2026-10-23', '2026-10-25')).toBe(2);
		expect(nightsBetween('2026-10-25', '2026-10-23')).toBe(0);
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});

	const multi = (from: string, to: string) => ({
		...newActivity(from),
		multiDay: true,
		endDate: to,
		endTime: '12:00'
	});

	it('logs nights and walking against the stream and categories Terrain uses', () => {
		const camp = { ...multi('2026-10-24', '2026-10-25'), kilometres: 1 };
		// As Terrain logs a camp that included walking towards Walkabout
		expect(nightsCamped(camp)).toBe(1);
		expect(logbookData(camp)).toEqual({
			distance_travelled: 1000,
			distance_walkabout: 1000,
			achievement_meta: { stream: 'camping', branch: 'camping' },
			categories: ['camping', 'walking_hike']
		});
		// Camping and no walking
		expect(logbookData({ ...camp, kilometres: 0 })).toMatchObject({
			distance_travelled: 0,
			categories: ['camping']
		});
		// As Terrain logs a day hike towards Walkabout
		const hike = { ...newActivity('2026-10-24'), kilometres: 12.5 };
		expect(logbookData(hike)).toEqual({
			distance_travelled: 12500,
			distance_walkabout: 12500,
			achievement_meta: { stream: 'bushwalking', branch: 'bushwalking' },
			categories: ['walking_hike']
		});
		// Nights away without camping don't count towards camping
		const away = { ...camp, camped: false };
		expect(nightsOf(away)).toBe(1);
		expect(nightsCamped(away)).toBe(0);
		expect(logbookData(away)).toMatchObject({
			achievement_meta: { stream: 'bushwalking', branch: 'bushwalking' },
			categories: ['walking_hike']
		});
		// Walking that doesn't count towards Walkabout
		expect(logbookData({ ...hike, walkabout: false })).toMatchObject({
			distance_travelled: 12500,
			distance_walkabout: 0
		});
		// An evening at the hall goes in no logbook
		expect(logbookData(newActivity('2026-10-24'))).toEqual({
			distance_travelled: 0,
			distance_walkabout: 0,
			achievement_meta: { stream: '', branch: '' },
			categories: []
		});
	});

	it('says what’s missing, in the order the form asks', () => {
		const draft = newActivity('2026-10-23');
		const after = new Date(2026, 9, 24);
		expect(activityProblems(draft, after)).toEqual([
			'Give the activity a title.',
			'Say where it was.',
			'Choose a challenge area.',
			'Tick who came.',
			'Say how it went.',
			'Tick the Scout method it used.',
			'Tick the SPICES it developed.'
		]);
		const done = {
			...draft,
			title: 'Knots night',
			location: 'The hall',
			challengeArea: 'Outdoors' as const,
			attendance: { m1: 'Participant' as const },
			review: { rating: 'okay' as const, tags: [], method: ['patrol_system'], spices: ['social'] }
		};
		expect(activityProblems(done, after)).toEqual([]);
		expect(activityProblems({ ...done, endTime: '18:00' }, after)).toEqual([
			'It needs to end after it starts.'
		]);
		// Still to come: only activities that are over can be logged
		expect(activityProblems(done, new Date(2026, 9, 23, 20, 0))).toEqual([NOT_OVER]);
	});

	it('starts on the most recent one that’s over', () => {
		const evening = new Date(2026, 9, 26, 22, 0);
		const morning = new Date(2026, 9, 26, 9, 0);
		expect(newActivity(undefined, evening)).toMatchObject({
			startDate: '2026-10-26',
			endDate: '2026-10-26'
		});
		expect(newActivity(undefined, morning)).toMatchObject({
			startDate: '2026-10-25',
			endDate: '2026-10-25'
		});
		expect(isOver(finishedBy(newActivity('2026-10-26'), morning), morning)).toBe(true);
	});

	it('needs a review once it’s over, as Terrain concludes it', () => {
		const draft = {
			...newActivity('2026-10-23'),
			title: 'Knots night',
			location: 'The hall',
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

	it('sums up who came and how many led', () => {
		expect(
			attendanceSummary({ a: 'Participant', b: 'Leader', c: 'Leader', d: 'Participant' })
		).toBe('4 came, 2 led');
		expect(attendanceSummary({ a: 'Participant' })).toBe('1 came');
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
		...newActivity('2026-10-26'),
		title: ' Test Activity ',
		startTime: '18:00',
		endTime: '19:30',
		challengeArea: 'Community' as const,
		location: 'Strath',
		attendance: { y1: 'Leader' as const, y2: 'Participant' as const, y3: 'Leader' as const }
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
				// Any number can lead; assisting isn't used
				leader_member_ids: ['y1', 'y3'],
				assistant_member_ids: [],
				attendee_member_ids: ['y1', 'y2', 'y3'],
				participant_member_ids: ['y1', 'y2', 'y3']
			},
			achievement_pathway_oas_data: {
				award_rule: 'individual',
				verifier: { name: 'Sam Leader', contact: '', type: 'member' },
				groups: []
			},
			location: 'Strath',
			iana_timezone: 'Australia/Adelaide',
			status: 'concluded'
		});
		expect(eventBody({ ...draft(), challengeArea: 'Personal growth' }, context)).toMatchObject({
			challenge_area: 'personal_growth'
		});
	});

	it('is sent already concluded, with its review, as Terrain’s planner concludes one', () => {
		const reviewed = {
			...draft(),
			review: {
				rating: 'great' as const,
				tags: ['adventurous', 'fun'],
				method: ['community_involvement'],
				spices: ['social', 'physical']
			}
		};
		const body = eventBody(reviewed, context);
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
