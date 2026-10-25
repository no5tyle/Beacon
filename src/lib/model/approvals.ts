// Submissions waiting for the Unit Council, as Terrain's Approvals tab shows them.
// Ported from Beacon's C# PendingApproval.

import type { TerrainAchievement, TerrainSubmission } from '../terrain/types.js';
import { asc, sortBy, titleCase } from './util.js';

export interface PendingApproval {
	submissionId: string;
	achievementId: string;
	achievementType: string;
	/** e.g. "OAS Bushwalking 3", "Milestone 2", "Intro To Section" */
	achievementName: string;
	memberId: string;
	memberName: string;
	/** "Review" (Unit Council sign off) or "Award" */
	submissionType: string;
	/** As Terrain gives it, e.g. "2026-10-20T09:15:00.000Z" */
	submittedOn: string;
	approvedBy: Voter[];
	improveBy: Voter[];
	/** Terrain says whether the signed in leader may action it */
	canAction: boolean;
	/**
	 * Approved by the Unit Council and waiting to be awarded (Terrain's "award" submissions), rather than a
	 * review to approve. Awarding takes one leader and a date, not votes
	 */
	isAward: boolean;
}

export interface Voter {
	memberId: string;
	name: string;
}

/** Terrain needs this many Unit Council members to agree before anything happens */
export const VOTES_NEEDED = 2;

/** Outcomes Terrain records when a Unit Council member asks for more work, as the Blazor app counted them */
const IMPROVE_OUTCOMES = ['rejected', 'improve', 'feedback'];

/** Same wording as the rest of Beacon, e.g. "OAS Bushwalking 3", "Milestone 2", "Intro To Section" */
export function achievementName(achievement: TerrainSubmission['achievement']): string {
	const meta = achievement.achievement_meta;
	let name: string;
	switch (achievement.type) {
		case 'special_interest_area':
			// e.g. "sia_better_world" → "Better World", as Progress shows SIA areas
			name = meta?.sia_area
				? meta.sia_area.replace(/^sia_/, '').replaceAll('_', ' ')
				: 'special interest area';
			break;
		case 'milestone':
			name = `milestone ${meta?.stage ?? ''}`;
			break;
		case 'outdoor_adventure_skill':
			name =
				meta?.stream === meta?.branch
					? `OAS ${meta?.stream ?? ''} ${meta?.stage ?? ''}`
					: `OAS ${meta?.stream ?? ''} ${meta?.branch ?? ''} ${meta?.stage ?? ''}`;
			break;
		case 'intro_section':
			name = 'intro to section';
			break;
		case 'intro_scouting':
			name = 'intro to scouting';
			break;
		default:
			name = achievement.type.replaceAll('_', ' ');
	}
	return titleCase(name);
}

function voters(result: TerrainSubmission, outcomes: readonly string[]): Voter[] {
	return (result.submission.actioned_by ?? [])
		.filter((a) => outcomes.includes(a.outcome))
		.map((a) => ({
			memberId: a.member_id,
			name: `${a.member_first_name ?? ''} ${a.member_last_name ?? ''}`.trim()
		}));
}

/** The submissions still waiting, oldest first */
export function pendingApprovals(results: readonly TerrainSubmission[]): PendingApproval[] {
	return sortBy(
		results
			.filter((r) => r.submission.status === 'pending')
			.map((r) => ({
				submissionId: r.submission.id,
				achievementId: r.achievement.id,
				achievementType: r.achievement.type,
				achievementName: achievementName(r.achievement),
				memberId: r.member.id,
				memberName: `${r.member.first_name ?? ''} ${r.member.last_name ?? ''}`.trim(),
				submissionType: titleCase(r.submission.type ?? ''),
				submittedOn: r.submission.date,
				approvedBy: voters(r, ['approved']),
				improveBy: voters(r, IMPROVE_OUTCOMES),
				canAction: r.unit_permissions?.write === true,
				isAward: r.submission.type === 'award'
			})),
		asc((a) => Date.parse(a.submittedOn) || 0)
	);
}

/** Whether Beacon can send this leader's approval: a review Terrain lets them action, not an award */
export const canApproveInBeacon = (approval: PendingApproval) =>
	approval.canAction && !approval.isAward;

/** Whether Beacon can award it: an award Terrain lets this leader action */
export const canAwardInBeacon = (approval: PendingApproval) =>
	approval.canAction && approval.isAward;

/** A day as Terrain's date_awarded takes it, e.g. "2026-10-25", in the leader's own time zone */
export function localDate(date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whether an award date is a real YYYY-MM-DD day that isn't in the future */
export function isAwardDate(value: string, now = new Date()): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day);
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day &&
		value <= localDate(now)
	);
}

/** Whether this leader's approval would be the one that sends it through */
export const isDecidingVote = (approval: PendingApproval) =>
	approval.approvedBy.length + 1 >= VOTES_NEEDED;

/**
 * Whether approving it could leave a special interest area plan waiting for the youth to move it on to
 * the review. Whether it really is the plan is only known from the youth's record, read after approving
 */
export const mayMoveToReview = (approval: PendingApproval) =>
	approval.achievementType === 'special_interest_area' &&
	canApproveInBeacon(approval) &&
	isDecidingVote(approval);

/** A special interest area record still on its plan, e.g. template "sia/cub/plan", and not yet awarded */
export const isSIAPlan = (record: TerrainAchievement) =>
	record.type === 'special_interest_area' &&
	/\/plan$/.test(record.template ?? '') &&
	record.status !== 'awarded';

/**
 * What Terrain sends when the youth moves an approved plan on to the review: the record as it stands,
 * not reset to draft. e.g. {"achievement_type":"special_interest_area","template":"sia/cub/plan",
 * "version":2,"section":"cub","answers":{...},"uploads":[],"reset_to_draft":false}
 */
export function moveToReviewBody(record: TerrainAchievement): Record<string, unknown> {
	return {
		achievement_type: 'special_interest_area',
		template: record.template,
		version: record.version,
		section: record.section,
		answers: structuredClone(record.answers ?? {}),
		uploads: Array.isArray(record.uploads) ? structuredClone(record.uploads) : [],
		reset_to_draft: false
	};
}

/**
 * What the leader has just done to a submission, kept until Terrain's list shows it: "voted" for an
 * approval that still needs more, "done" for one that went through or was awarded. Which it was is kept
 * too, as a review that went through may come back as an award
 */
export interface Actioned {
	action: 'voted' | 'done';
	wasAward: boolean;
}

/**
 * The list as it should look after the leader's actions, as Terrain can take a moment to show them. A
 * submission that's done is left out, and the leader's approval is added where it's missing. Says which
 * actions Terrain's list hasn't caught up with yet, so it can be checked again
 */
export function withActioned(
	list: readonly PendingApproval[],
	actioned: ReadonlyMap<string, Actioned>,
	leader: Voter
): { list: PendingApproval[]; lagging: string[] } {
	const lagging: string[] = [];
	const shown: PendingApproval[] = [];
	for (const approval of list) {
		const done = actioned.get(approval.submissionId);
		// Listed as something else now, e.g. the review came back as an award: Terrain has moved it on
		if (!done || done.wasAward !== approval.isAward) shown.push(approval);
		else if (done.action === 'done') lagging.push(approval.submissionId);
		else if (hasVoted(approval, leader.memberId)) shown.push(approval);
		else {
			lagging.push(approval.submissionId);
			shown.push({ ...approval, approvedBy: [...approval.approvedBy, leader] });
		}
	}
	return { list: shown, lagging };
}

/** Whether this leader has already voted on it, either way */
export const hasVoted = (approval: PendingApproval, memberId: string) =>
	[...approval.approvedBy, ...approval.improveBy].some((v) => v.memberId === memberId);

/** e.g. "today", "yesterday", "3 days ago" or "2 Oct 2026" for anything older than a fortnight */
export function submittedDisplay(submittedOn: string, now = new Date()): string {
	const submitted = new Date(submittedOn);
	if (Number.isNaN(submitted.getTime())) return '';
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((day(now) - day(submitted)) / 86_400_000);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 14) return `${days} days ago`;
	return submitted.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A submission the Unit Council has finished with, for the history */
export interface DecidedSubmission {
	submissionId: string;
	achievementName: string;
	memberId: string;
	memberName: string;
	submissionType: string;
	/** As Terrain gives it, e.g. "approved" */
	outcome: string;
	submittedOn: string;
	/** When the last vote was cast, or the submission's own date if Terrain gives no vote times */
	decidedOn: string;
	approvedBy: Voter[];
	improveBy: Voter[];
}

/** Days of history shown before "Show older" */
export const RECENT_DAYS = 90;

const time = (value: string | undefined) => (value ? Date.parse(value) || 0 : 0);

/** The unit's finalised submissions, most recently decided first */
export function decidedSubmissions(results: readonly TerrainSubmission[]): DecidedSubmission[] {
	return results
		.filter((r) => r.submission.status === 'finalised')
		.map((r) => {
			const lastVote = Math.max(0, ...(r.submission.actioned_by ?? []).map((a) => time(a.time)));
			return {
				submissionId: r.submission.id,
				achievementName: achievementName(r.achievement),
				memberId: r.member.id,
				memberName: `${r.member.first_name ?? ''} ${r.member.last_name ?? ''}`.trim(),
				submissionType: titleCase(r.submission.type ?? ''),
				outcome: r.submission.outcome ?? '',
				submittedOn: r.submission.date,
				decidedOn: lastVote > 0 ? new Date(lastVote).toISOString() : r.submission.date,
				approvedBy: voters(r, ['approved']),
				improveBy: voters(r, IMPROVE_OUTCOMES)
			};
		})
		.sort((a, b) => time(b.decidedOn) - time(a.decidedOn));
}

/** Decided within the last few days, e.g. the last 90 */
export const decidedWithin = (item: DecidedSubmission, days: number, now = new Date()) =>
	now.getTime() - time(item.decidedOn) <= days * 86_400_000;

/** e.g. "Approved", or "Needs improvement" for the other outcomes Terrain records */
export const outcomeDisplay = (outcome: string) =>
	outcome === 'approved'
		? 'Approved'
		: IMPROVE_OUTCOMES.includes(outcome)
			? 'Needs improvement'
			: titleCase(outcome.replaceAll('_', ' ')) || 'Finalised';
