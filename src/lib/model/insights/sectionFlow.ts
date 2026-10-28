// The flow of youth through the section over the coming terms: who moves up into it from the section
// below, who moves up out of it, and how each patrol changes. Worked out from dates of birth and the
// sections' move up ages, so it's what to expect, not what's booked.

import { addMonths, type CalendarDate } from '../dates.js';
import { asc, sortBy } from '../util.js';
import { moveUpDate } from './insightsCalculator.js';
import type { SectionRules } from './settings.js';

/** Youth move up through these in order */
export const SECTION_ORDER = ['joey', 'cub', 'scout', 'venturer', 'rover'];

/** The section youth move up from into this one, or "" for Joeys (and sections Beacon doesn't know) */
export function sectionBelow(section: string): string {
	const index = SECTION_ORDER.indexOf(section);
	return index > 0 ? SECTION_ORDER[index - 1] : '';
}

export interface FlowYouth {
	id: string;
	name: string;
	dateOfBirth: CalendarDate | null;
	/** In this unit, their patrol; coming in, the unit they're in now */
	group: string;
}

export interface FlowMove extends FlowYouth {
	/** When they reach the move up age */
	date: CalendarDate;
	/** Already past it: counted in the first term */
	overdue: boolean;
}

/**
 * A school term, taken as a quarter of the year: Term 1 is January to March and so on. States' terms
 * differ by a week or two, which doesn't matter for seeing who's coming and going
 */
export interface Term {
	year: number;
	term: number;
	start: CalendarDate;
	/** The day after it ends */
	end: CalendarDate;
	arrivals: FlowMove[];
	departures: FlowMove[];
	/** Youth in the unit at the end of the term, if the moves happen as expected */
	sizeAfter: number;
}

export interface PatrolFlow {
	patrol: string;
	now: number;
	/** Leaving over the terms shown, soonest first */
	leaving: FlowMove[];
	after: number;
}

export interface SectionFlow {
	terms: Term[];
	current: number;
	patrols: PatrolFlow[];
	/** Youth without a date of birth in Terrain, who can't be placed in a term */
	unknownHere: number;
	unknownBelow: number;
	/** Youth in the section below who are already in this unit too, left out of the arrivals */
	alreadyHere: number;
}

export const NO_PATROL = 'No patrol';
const pad = (n: number) => String(n).padStart(2, '0');

function termOf(date: CalendarDate): { year: number; term: number } {
	const [year, month] = date.split('-').map(Number);
	return { year, term: Math.floor((month - 1) / 3) + 1 };
}

/** The current term and the ones after it */
export function upcomingTerms(today: CalendarDate, count: number): Term[] {
	const { year, term } = termOf(today);
	const first = `${year}-${pad((term - 1) * 3 + 1)}-01`;
	return Array.from({ length: count }, (_, i) => {
		const start = addMonths(first, i * 3);
		return {
			...termOf(start),
			start,
			end: addMonths(start, 3),
			arrivals: [],
			departures: [],
			sizeAfter: 0
		};
	});
}

function moves(youth: readonly FlowYouth[], rules: SectionRules, terms: Term[]): FlowMove[] {
	return youth
		.filter((y) => y.dateOfBirth)
		.map((y) => {
			const date = moveUpDate(y.dateOfBirth!, rules);
			return { ...y, date, overdue: date < terms[0].start };
		})
		.filter((m) => m.date < terms[terms.length - 1].end);
}

const termFor = (terms: Term[], move: FlowMove) =>
	move.overdue ? terms[0] : terms.find((t) => move.date >= t.start && move.date < t.end)!;

export function sectionFlow(
	here: readonly FlowYouth[],
	hereRules: SectionRules,
	below: readonly FlowYouth[],
	belowRules: SectionRules | null,
	today: CalendarDate,
	termCount = 4
): SectionFlow {
	const terms = upcomingTerms(today, termCount);
	const hereIds = new Set(here.map((y) => y.id));
	// Youth linking across are in both units: they're already counted here, so they aren't arriving
	const coming = below.filter((y) => !hereIds.has(y.id));

	const departures = sortBy(
		moves(here, hereRules, terms),
		asc((m) => m.date)
	);
	const arrivals = belowRules
		? sortBy(
				moves(coming, belowRules, terms),
				asc((m) => m.date)
			)
		: [];
	for (const move of departures) termFor(terms, move).departures.push(move);
	for (const move of arrivals) termFor(terms, move).arrivals.push(move);
	let size = here.length;
	for (const term of terms) {
		size += term.arrivals.length - term.departures.length;
		term.sizeAfter = size;
	}

	const patrolNames = [...new Set(here.map((y) => y.group || NO_PATROL))];
	const patrols = sortBy(
		patrolNames.map((patrol) => {
			const now = here.filter((y) => (y.group || NO_PATROL) === patrol).length;
			const leaving = departures.filter((m) => (m.group || NO_PATROL) === patrol);
			return { patrol, now, leaving, after: now - leaving.length };
		}),
		// The patrols with fewest left first, as they're where arrivals are most needed
		asc((p) => p.after),
		asc((p) => -p.leaving.length),
		asc((p) => p.patrol === NO_PATROL),
		asc((p) => p.patrol)
	);

	return {
		terms,
		current: here.length,
		patrols,
		unknownHere: here.filter((y) => !y.dateOfBirth).length,
		unknownBelow: belowRules ? coming.filter((y) => !y.dateOfBirth).length : 0,
		alreadyHere: below.length - coming.length
	};
}
