// A unit programme activity as Record's Log activity builds it: what it was, who came and in what role,
// and what goes in their logbooks. Not sent to Terrain yet: its requests for activities haven't been
// captured.

import { addDays, daysBetween, today, type CalendarDate } from './dates.js';

export const ACTIVITY_TYPES = ['Unit night', 'Outing', 'Camp', 'Hike'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The four challenge areas milestones count activities in */
export const CHALLENGE_AREAS = ['Community', 'Outdoors', 'Creative', 'Personal growth'] as const;
export type ChallengeArea = (typeof CHALLENGE_AREAS)[number];

/** How a youth took part, which is how milestones count it */
export const ROLES = ['Participant', 'Assistant', 'Leader'] as const;
export type Role = (typeof ROLES)[number];

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
}

export function newActivity(type: ActivityType = 'Unit night', on = today()): ActivityDraft {
	const draft: ActivityDraft = {
		type,
		title: '',
		startDate: on,
		startTime: '19:00',
		endDate: on,
		endTime: '21:00',
		location: '',
		challengeArea: '',
		attendance: {},
		nights: 0,
		kilometres: 0,
		logbookFor: {}
	};
	return withType(draft, type);
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

/** What's missing before the activity could be saved, in the order the form asks for it */
export function activityProblems(draft: ActivityDraft): string[] {
	const problems: string[] = [];
	if (!draft.title.trim()) problems.push('Give the activity a title.');
	if (!draft.challengeArea) problems.push('Choose a challenge area.');
	if (`${draft.endDate}T${draft.endTime}` <= `${draft.startDate}T${draft.startTime}`)
		problems.push('It needs to end after it starts.');
	if (Object.keys(draft.attendance).length === 0) problems.push('Tick who came.');
	if (draft.nights < 0 || draft.kilometres < 0) problems.push("Logbook figures can't be negative.");
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
