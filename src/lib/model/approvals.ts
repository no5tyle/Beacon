// Submissions waiting for the Unit Council, as Terrain's Approvals tab shows them.
// Ported from Beacon's C# PendingApproval.

import type { TerrainSubmission } from '../terrain/types.js';
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
				canAction: r.unit_permissions?.write === true
			})),
		asc((a) => Date.parse(a.submittedOn) || 0)
	);
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
