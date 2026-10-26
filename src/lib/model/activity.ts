// A unit programme activity as Record's Log activity builds it: what it was, who came and in what role,
// what goes in their logbooks, and how it went. Only activities that are over: saved to Terrain as its
// activity planner saves one, planned and then straight away concluded with its review. The logbook
// figures aren't sent yet, as how Terrain records them hasn't been captured.

import { addDays, daysBetween, today, type CalendarDate } from './dates.js';

export const ACTIVITY_TYPES = ['Unit night', 'Outing', 'Camp', 'Hike'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The four challenge areas milestones count activities in */
export const CHALLENGE_AREAS = ['Community', 'Outdoors', 'Creative', 'Personal growth'] as const;
export type ChallengeArea = (typeof CHALLENGE_AREAS)[number];

/** How a youth took part, which is how milestones count it */
export const ROLES = ['Participant', 'Assistant', 'Leader'] as const;
export type Role = (typeof ROLES)[number];

/** How it went, as Terrain's review rates an activity */
export const RATINGS = [
	{ id: 'great', name: 'Great' },
	{ id: 'okay', name: 'Okay' },
	{ id: 'boring', name: 'Boring' }
] as const;
export type Rating = (typeof RATINGS)[number]['id'];

/** Words that describe an activity, as Terrain's review tags it */
export const TAGS = [
	{ id: 'fun', name: 'Fun' },
	{ id: 'challenging', name: 'Challenging' },
	{ id: 'inclusive', name: 'Inclusive' },
	{ id: 'adventurous', name: 'Adventurous' }
] as const;

/** The elements of the Scout method an activity used, as Terrain names them */
export const SCOUT_METHOD = [
	{ id: 'community_involvement', name: 'Community involvement' },
	{ id: 'personal_progression', name: 'Personal progression' },
	{ id: 'promise_and_law', name: 'Promise and Law' },
	{ id: 'learn_by_doing', name: 'Learning by doing' },
	{ id: 'nature_and_outdoors', name: 'Nature and outdoors' },
	{ id: 'symbolic_framework', name: 'Symbolic framework' },
	{ id: 'patrol_system', name: 'Patrol system' },
	{ id: 'youth_leading_adult_supporting', name: 'Youth leading, adults supporting' }
] as const;

/** The SPICES areas of personal growth an activity developed, as Terrain names them */
export const SPICES = [
	{ id: 'social', name: 'Social' },
	{ id: 'physical', name: 'Physical' },
	{ id: 'intellectual', name: 'Intellectual' },
	{ id: 'character', name: 'Character' },
	{ id: 'emotional', name: 'Emotional' },
	{ id: 'spiritual', name: 'Spiritual' }
] as const;

export interface ActivityReview {
	rating: Rating | '';
	/** Tag ids, if any */
	tags: string[];
	/** Scout method element ids */
	method: string[];
	/** SPICES ids */
	spices: string[];
}

export interface ActivityDraft {
	type: ActivityType;
	title: string;
	startDate: CalendarDate;
	startTime: string;
	endDate: CalendarDate;
	endTime: string;
	location: string;
	challengeArea: ChallengeArea | '';
	/** Each youth who came, by member id, and their role */
	attendance: Record<string, Role>;
	/** Logbook figures for everyone who came, and any youth whose differ */
	nights: number;
	kilometres: number;
	logbookFor: Record<string, { nights: number; kilometres: number }>;
	/** How it went, for one that's over: Terrain needs it to conclude the activity */
	review: ActivityReview;
}

/**
 * A new activity of a type, on a given day, or by default the most recent one that's over: tonight's unit
 * night once it's finished, otherwise last night's
 */
export function newActivity(
	type: ActivityType = 'Unit night',
	on?: CalendarDate,
	now = new Date()
): ActivityDraft {
	const day = on ?? today(now);
	const draft: ActivityDraft = {
		type,
		title: '',
		startDate: day,
		startTime: '19:00',
		endDate: day,
		endTime: '21:00',
		location: '',
		challengeArea: '',
		attendance: {},
		nights: 0,
		kilometres: 0,
		logbookFor: {},
		review: { rating: '', tags: [], method: [], spices: [] }
	};
	const typed = withType(draft, type);
	return on ? typed : finishedBy(typed, now);
}

/** Moves the activity back a day at a time, keeping its length, until it's over by now */
export function finishedBy(draft: ActivityDraft, now = new Date()): ActivityDraft {
	let moved = draft;
	for (let days = 1; !isOver(moved, now) && days <= 14; days++)
		moved = {
			...draft,
			startDate: addDays(draft.startDate, -days),
			endDate: addDays(draft.endDate, -days)
		};
	return moved;
}

/**
 * Changes the type, with times and logbook figures to suit: a camp runs over a night from Friday evening,
 * a hike or outing is a day out, a unit night an evening at the hall
 */
export function withType(draft: ActivityDraft, type: ActivityType): ActivityDraft {
	const times: Record<ActivityType, [string, string, number]> = {
		'Unit night': ['19:00', '21:00', 0],
		Outing: ['09:00', '15:00', 0],
		Camp: ['18:00', '12:00', 2],
		Hike: ['08:00', '16:00', 0]
	};
	const [startTime, endTime, days] = times[type];
	const endDate = addDays(draft.startDate, days);
	return {
		...draft,
		type,
		startTime,
		endTime,
		endDate,
		nights: type === 'Camp' ? nightsBetween(draft.startDate, endDate) : 0,
		kilometres: type === 'Hike' ? draft.kilometres : 0
	};
}

/** Nights away for an activity from one day to another, e.g. Friday to Sunday is 2 */
export const nightsBetween = (start: CalendarDate, end: CalendarDate) =>
	Math.max(0, daysBetween(start, end));

/** Whether the activity can have logbook figures: anything but a unit night at the hall */
export const hasLogbook = (type: ActivityType) => type !== 'Unit night';

/** A youth's logbook figures: their own where they differ, otherwise everyone's */
export const logbookOf = (draft: ActivityDraft, memberId: string) =>
	draft.logbookFor[memberId] ?? { nights: draft.nights, kilometres: draft.kilometres };

/**
 * Whether the activity is over. Log activity takes only those, as Terrain concludes only activities whose
 * end has passed, giving those who came credit for it
 */
export const isOver = (draft: ActivityDraft, now = new Date()) =>
	new Date(`${draft.endDate}T${draft.endTime}`).getTime() <= now.getTime();

/** What the review still needs before Terrain will conclude the activity */
export function reviewProblems(review: ActivityReview): string[] {
	const problems: string[] = [];
	if (!review.rating) problems.push('Say how it went.');
	if (review.method.length === 0) problems.push('Tick the Scout method it used.');
	if (review.spices.length === 0) problems.push('Tick the SPICES it developed.');
	return problems;
}

/** Why an activity still to come can't be logged */
export const NOT_OVER = "It hasn't finished yet. Log activities once they're over.";

/** What's missing before the activity could be saved, in the order the form asks for it */
export function activityProblems(draft: ActivityDraft, now = new Date()): string[] {
	const problems: string[] = [];
	if (!draft.title.trim()) problems.push('Give the activity a title.');
	if (!draft.challengeArea) problems.push('Choose a challenge area.');
	if (`${draft.endDate}T${draft.endTime}` <= `${draft.startDate}T${draft.startTime}`)
		problems.push('It needs to end after it starts.');
	else if (!isOver(draft, now)) problems.push(NOT_OVER);
	if (Object.keys(draft.attendance).length === 0) problems.push('Tick who came.');
	if (draft.nights < 0 || draft.kilometres < 0) problems.push("Logbook figures can't be negative.");
	problems.push(...reviewProblems(draft.review));
	return problems;
}

/** How many came in each role, e.g. "8 participants, 2 assistants, 1 leader" */
export function attendanceSummary(attendance: Record<string, Role>): string {
	const count = (role: Role) => Object.values(attendance).filter((r) => r === role).length;
	return ROLES.map((role) => [role, count(role)] as const)
		.filter(([, n]) => n > 0)
		.map(([role, n]) => `${n} ${role.toLowerCase()}${n === 1 ? '' : 's'}`)
		.join(', ');
}

/** Who is saving the activity, and where, for Terrain's activity */
export interface ActivityContext {
	unitId: string;
	/** The leader's member id, as the activity's organiser */
	organiserId: string;
	/** The leader's name, as the verifier Terrain records */
	verifierName: string;
	/** e.g. "Australia/Adelaide" */
	timeZone: string;
}

/** A local date and time as Terrain sends it, in UTC, e.g. "2026-10-26T07:30:00.000+00:00" */
export const terrainDateTime = (date: CalendarDate, time: string) =>
	new Date(`${date}T${time}`).toISOString().replace('Z', '+00:00');

/** The ids picked, in the order Terrain lists them, whatever order they were ticked in */
const inOrder = (all: readonly { id: string }[], picked: string[]) =>
	all.map((option) => option.id).filter((id) => picked.includes(id));

/** e.g. "Personal growth" to "personal_growth" */
const terrainChallengeArea = (area: ChallengeArea | '') => area.toLowerCase().replaceAll(' ', '_');

/**
 * The activity as Terrain's planner sends it: planned, to units/{unit}/events, with who came in each role
 * and everyone who came as attendees; or concluded, to events/{id}, with its review as well. Logbook
 * figures are sent empty for now
 */
export function eventBody(
	draft: ActivityDraft,
	context: ActivityContext,
	status: 'planned' | 'concluded' = 'planned'
): Record<string, unknown> {
	const inRole = (role: Role) =>
		Object.entries(draft.attendance)
			.filter(([, r]) => r === role)
			.map(([id]) => id);
	const verifier = { name: context.verifierName, contact: '', type: 'member' };
	return {
		title: draft.title.trim(),
		description: '',
		justification: '',
		organisers: [context.organiserId],
		challenge_area: terrainChallengeArea(draft.challengeArea),
		start_datetime: terrainDateTime(draft.startDate, draft.startTime),
		end_datetime: terrainDateTime(draft.endDate, draft.endTime),
		event_type: { type: 'unit', id: context.unitId },
		attendance: {
			leader_member_ids: inRole('Leader'),
			assistant_member_ids: inRole('Assistant'),
			attendee_member_ids: Object.keys(draft.attendance),
			participant_member_ids: inRole('Participant')
		},
		schedule_items: [],
		achievement_pathway_oas_data: { award_rule: 'individual', verifier, groups: [] },
		achievement_pathway_logbook_data: {
			distance_travelled: 0,
			distance_walkabout: 0,
			achievement_meta: { stream: '', branch: '' },
			categories: [],
			details: { activity_time_length: '', activity_grade: '' },
			...(status === 'concluded' ? { title: '' } : {}),
			verifier
		},
		review:
			status === 'concluded'
				? {
						general_tags: inOrder(TAGS, draft.review.tags),
						scout_method_elements: inOrder(SCOUT_METHOD, draft.review.method),
						scout_spices_elements: inOrder(SPICES, draft.review.spices),
						general_rating: draft.review.rating
					}
				: { general_tags: [], scout_method_elements: [], scout_spices_elements: [] },
		uploads: [],
		equipment_notes: '',
		additional_notes: '',
		location: draft.location.trim(),
		iana_timezone: context.timeZone,
		status
	};
}
