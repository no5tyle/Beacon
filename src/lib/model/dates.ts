// Dates without a time of day, as "YYYY-MM-DD" strings: birthdays, award dates and today.
// Worked out in UTC so the phone's time zone never shifts a date.

/** A date as "YYYY-MM-DD" */
export type CalendarDate = string;

// Australian English short month names, as leaders' phones show them (note "June", "July" and "Sept")
const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'June',
	'July',
	'Aug',
	'Sept',
	'Oct',
	'Nov',
	'Dec'
];

function parts(date: CalendarDate): [number, number, number] {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
	if (!match) throw new Error(`Not a date: ${date}`);
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function fromParts(year: number, month: number, day: number): CalendarDate {
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The date part of a Terrain date-time, e.g. "2012-03-15T00:00:00" → "2012-03-15" */
export function toCalendarDate(value: string): CalendarDate {
	return fromParts(...parts(value));
}

/** Today's date where the leader is */
export function today(now = new Date()): CalendarDate {
	return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Adds months like .NET's DateTime.AddMonths: the day is kept, or moved back to the end of a shorter month */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
	const [year, month, day] = parts(date);
	const index = year * 12 + (month - 1) + months;
	const newYear = Math.floor(index / 12);
	const newMonth = (index % 12) + 1;
	return fromParts(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)));
}

/** Adds days, e.g. from a camp's first day to its last */
export function addDays(date: CalendarDate, days: number): CalendarDate {
	const [year, month, day] = parts(date);
	const next = new Date(Date.UTC(year, month - 1, day + days));
	return fromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function addYears(date: CalendarDate, years: number): CalendarDate {
	return addMonths(date, years * 12);
}

/** Whole days from one date to another (negative when "to" is earlier) */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	const [y1, m1, d1] = parts(from);
	const [y2, m2, d2] = parts(to);
	return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000;
}

/** Whole months from a birthday to a date, e.g. for an age of "12y 4m" */
export function wholeMonthsBetween(from: CalendarDate, to: CalendarDate): number {
	const [y1, m1, d1] = parts(from);
	const [y2, m2, d2] = parts(to);
	let months = (y2 - y1) * 12 + m2 - m1;
	if (d2 < d1) months--;
	return months;
}

/** e.g. "Nov 2028" or "Sept 2030" */
export function monthYear(date: CalendarDate): string {
	const [year, month] = parts(date);
	return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** e.g. "22/10/2026", as Terrain records verification dates */
export function dayMonthYear(date: CalendarDate): string {
	const [year, month, day] = parts(date);
	return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** e.g. "22/10/26", as Beacon shows dates in tables */
export function shortDate(date: CalendarDate | null): string {
	if (!date) return '';
	const [year, month, day] = parts(date);
	return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`;
}
