// A unit programme activity as Record's Log activity builds it: what it was, who came and in what role,
// what goes in their logbooks, and how it went. Only activities that are over: saved to Terrain already
// concluded, with its review, as its activity planner concludes one.

import { addDays, daysBetween, today, type CalendarDate } from './dates.js';

/** The four challenge areas milestones count activities in */
export const CHALLENGE_AREAS = ['Community', 'Outdoors', 'Creative', 'Personal growth'] as const;
export type ChallengeArea = (typeof CHALLENGE_AREAS)[number];

/**
 * How a youth took part, which is how milestones count it: everyone who came participated, and any number
 * of them may have led it too. Terrain no longer uses assisting
 */
export const ROLES = ['Participant', 'Leader'] as const;
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
	title: string;
	/** Over more than one day, e.g. a camp, rather than an evening or a day out */
	multiDay: boolean;
	startDate: CalendarDate;
	startTime: string;
	endDate: CalendarDate;
	endTime: string;
	location: string;
	challengeArea: ChallengeArea | '';
	/** Each youth who came, by member id, and their role */
	attendance: Record<string, Role>;
	/**
	 * Kilometres walked, for everyone who came: Terrain logs an activity's figures for all of them. Nights
	 * away come from its dates
	 */
	kilometres: number;
	/** Whether they camped on the nights away, which counts towards camping */
	camped: boolean;
	/** Whether the walking counts towards the Walkabout award */
	walkabout: boolean;
	/** How it went, for one that's over: Terrain needs it to conclude the activity */
	review: ActivityReview;
}

/**
 * A new activity on a given day, or by default the most recent evening that's over: tonight once it's
 * finished, otherwise last night
 */
export function newActivity(on?: CalendarDate, now = new Date()): ActivityDraft {
	const day = on ?? today(now);
	const draft: ActivityDraft = {
		title: '',
		multiDay: false,
		startDate: day,
		startTime: '19:00',
		endDate: day,
		endTime: '21:00',
		location: '',
		challengeArea: '',
		attendance: {},
		kilometres: 0,
		camped: true,
		walkabout: true,
		review: { rating: '', tags: [], method: [], spices: [] }
	};
	return on ? draft : finishedBy(draft, now);
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
 * Over more than one day or not. More than one day starts with the next day as its last, if it ended
 * the day it started; one day ends the day it starts. Moved back if need be, so it's still over
 */
export function withMultiDay(
	draft: ActivityDraft,
	multiDay: boolean,
	now = new Date()
): ActivityDraft {
	const endDate = multiDay
		? draft.endDate > draft.startDate
			? draft.endDate
			: addDays(draft.startDate, 1)
		: draft.startDate;
	return finishedBy({ ...draft, multiDay, endDate }, now);
}

/** Nights away for an activity from one day to another, e.g. Friday to Sunday is 2 */
export const nightsBetween = (start: CalendarDate, end: CalendarDate) =>
	Math.max(0, daysBetween(start, end));

/** Nights away, from its dates, as Terrain counts them */
export const nightsOf = (draft: ActivityDraft) =>
	draft.multiDay ? nightsBetween(draft.startDate, draft.endDate) : 0;

/** Nights camped: nights away, if they camped */
export const nightsCamped = (draft: ActivityDraft) => (draft.camped ? nightsOf(draft) : 0);

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
	if (!draft.location.trim()) problems.push('Say where it was.');
	if (!draft.challengeArea) problems.push('Choose a challenge area.');
	if (`${draft.endDate}T${draft.endTime}` <= `${draft.startDate}T${draft.startTime}`)
		problems.push('It needs to end after it starts.');
	else if (!isOver(draft, now)) problems.push(NOT_OVER);
	if (Object.keys(draft.attendance).length === 0) problems.push('Tick who came.');
	if (draft.kilometres < 0) problems.push("Kilometres can't be negative.");
	problems.push(...reviewProblems(draft.review));
	return problems;
}

/** How many came and how many of them led, e.g. "8 came, 2 led" */
export function attendanceSummary(attendance: Record<string, Role>): string {
	const came = Object.keys(attendance).length;
	const led = Object.values(attendance).filter((r) => r === 'Leader').length;
	if (came === 0) return '';
	return led > 0 ? `${came} came, ${led} led` : `${came} came`;
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

/**
 * The logbook part of Terrain's activity: metres walked (all of it counting towards Walkabout, or none),
 * the OAS stream it's logged against, and its categories. Terrain counts nights towards camping only with
 * the camping category, and counts them from the dates; walking_hike is for walking. Nights camped log it
 * against Camping, walking alone against Bushwalking, and neither goes in no logbook
 */
export function logbookData(draft: ActivityDraft) {
	const metres = Math.round(Math.max(0, draft.kilometres) * 1000);
	const camping = nightsCamped(draft) > 0;
	const walking = metres > 0;
	const stream = camping ? 'camping' : walking ? 'bushwalking' : '';
	return {
		distance_travelled: metres,
		distance_walkabout: draft.walkabout ? metres : 0,
		achievement_meta: { stream, branch: stream },
		categories: [...(camping ? ['camping'] : []), ...(walking ? ['walking_hike'] : [])]
	};
}

/** The ids picked, in the order Terrain lists them, whatever order they were ticked in */
const inOrder = (all: readonly { id: string }[], picked: string[]) =>
	all.map((option) => option.id).filter((id) => picked.includes(id));

/** e.g. "Personal growth" to "personal_growth" */
const terrainChallengeArea = (area: ChallengeArea | '') => area.toLowerCase().replaceAll(' ', '_');

/**
 * The activity as Terrain's planner sends it to units/{unit}/events, already concluded: everyone who
 * came as attendees and participants, those who led it as well, its logbook figures, and its review
 */
export function eventBody(draft: ActivityDraft, context: ActivityContext): Record<string, unknown> {
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
			// Terrain no longer uses assisting
			assistant_member_ids: [],
			// Everyone who came took part; leading is as well as that
			attendee_member_ids: Object.keys(draft.attendance),
			participant_member_ids: Object.keys(draft.attendance)
		},
		schedule_items: [],
		achievement_pathway_oas_data: { award_rule: 'individual', verifier, groups: [] },
		achievement_pathway_logbook_data: {
			...logbookData(draft),
			details: { activity_time_length: '', activity_grade: '' },
			title: '',
			verifier
		},
		review: {
			general_tags: inOrder(TAGS, draft.review.tags),
			scout_method_elements: inOrder(SCOUT_METHOD, draft.review.method),
			scout_spices_elements: inOrder(SPICES, draft.review.spices),
			general_rating: draft.review.rating
		},
		uploads: [],
		equipment_notes: '',
		additional_notes: '',
		location: draft.location.trim(),
		iana_timezone: context.timeZone,
		status: 'concluded'
	};
}
