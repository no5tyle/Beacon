import { describe, expect, it } from 'vitest';
import {
	achievementName,
	decidedSubmissions,
	decidedWithin,
	hasVoted,
	isAwardDate,
	isSIAPlan,
	localDate,
	mayMoveToReview,
	moveToReviewBody,
	outcomeDisplay,
	pendingApprovals,
	submittedDisplay,
	withActioned,
	type Actioned
} from '#lib/model/approvals.js';
import { ApprovalsService } from '#lib/services/approvals.js';
import { ApprovalsBadge, waitingForLeader } from '#lib/stores/approvals.svelte.js';
import { ACHIEVEMENTS_ADDRESS } from '#lib/terrain/client.js';
import type { TerrainAchievement, TerrainSubmission } from '#lib/terrain/types.js';
import { leaderProfiles, signedInTerrain } from './fakeTerrain.js';

const submission = (
	id: string,
	extra: {
		type?: string;
		meta?: TerrainSubmission['achievement']['achievement_meta'];
		date?: string;
		status?: string;
		write?: boolean;
		votes?: [string, string, string][];
		member?: [string, string, string];
	} = {}
): TerrainSubmission => ({
	achievement: {
		id: `ach-${id}`,
		type: extra.type ?? 'outdoor_adventure_skill',
		achievement_meta: extra.meta ?? { stream: 'bushwalking', branch: 'bushwalking', stage: 3 }
	},
	submission: {
		id,
		type: 'review',
		date: extra.date ?? '2026-10-20T09:15:00.000Z',
		status: extra.status ?? 'pending',
		actioned_by: (extra.votes ?? []).map(([member_id, name, outcome]) => ({
			member_id,
			member_first_name: name.split(' ')[0],
			member_last_name: name.split(' ')[1],
			outcome
		}))
	},
	unit_permissions: { write: extra.write ?? true },
	member: {
		id: extra.member?.[0] ?? 'm1',
		first_name: extra.member?.[1] ?? 'Ava',
		last_name: extra.member?.[2] ?? 'Nguyen'
	}
});

describe('pending approvals', () => {
	it('names achievements the way the rest of Beacon does', () => {
		const name = (type: string, meta = {}) =>
			achievementName({ id: 'a', type, achievement_meta: meta });
		expect(
			name('outdoor_adventure_skill', { stream: 'bushwalking', branch: 'bushwalking', stage: 3 })
		).toBe('OAS Bushwalking 3');
		expect(
			name('outdoor_adventure_skill', { stream: 'aquatics', branch: 'snorkelling', stage: 4 })
		).toBe('OAS Aquatics Snorkelling 4');
		expect(name('milestone', { stage: 2 })).toBe('Milestone 2');
		expect(name('special_interest_area', { sia_area: 'sia_better_world' })).toBe('Better World');
		expect(name('intro_section')).toBe('Intro To Section');
		expect(name('peak_award')).toBe('Peak Award');
	});

	it('keeps only those still pending, oldest first, with who has voted which way', () => {
		const list = pendingApprovals([
			submission('s2', { date: '2026-10-22T00:00:00Z', votes: [['l1', 'Sam Leader', 'approved']] }),
			submission('s1', { date: '2026-10-18T00:00:00Z', votes: [['l2', 'Kim Leader', 'feedback']] }),
			submission('s3', { status: 'finalised' }),
			submission('s4', { write: false, type: 'milestone', meta: { stage: 1 } })
		]);
		expect(list.map((a) => a.submissionId)).toEqual(['s1', 's4', 's2']);
		expect(list[2]).toMatchObject({
			achievementName: 'OAS Bushwalking 3',
			memberName: 'Ava Nguyen',
			submissionType: 'Review',
			approvedBy: [{ memberId: 'l1', name: 'Sam Leader' }],
			improveBy: [],
			canAction: true
		});
		expect(list[0].improveBy).toEqual([{ memberId: 'l2', name: 'Kim Leader' }]);
		expect(list[1].canAction).toBe(false);
		expect(hasVoted(list[2], 'l1')).toBe(true);
		expect(hasVoted(list[0], 'l2')).toBe(true);
		expect(hasVoted(list[2], 'l2')).toBe(false);
	});

	it('says when something was submitted, as the Blazor app did', () => {
		const now = new Date(2026, 9, 25, 20, 0);
		expect(submittedDisplay(new Date(2026, 9, 25, 8, 0).toISOString(), now)).toBe('today');
		expect(submittedDisplay(new Date(2026, 9, 24, 23, 0).toISOString(), now)).toBe('yesterday');
		expect(submittedDisplay(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe('5 days ago');
		expect(submittedDisplay(new Date(2026, 8, 2, 12, 0).toISOString(), now)).toMatch(
			/^2 Sept? 2026$/
		);
		expect(submittedDisplay('not a date', now)).toBe('');
	});
});

describe('approving', () => {
	const unit = (submissions: TerrainSubmission[]) => ({
		profiles: leaderProfiles(),
		members: [],
		records: {},
		submissions
	});

	it('loads the unit’s pending submissions from Terrain', async () => {
		const { terrain, calls } = await signedInTerrain(unit([submission('s1')]));
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const list = await service.pending('unit-1');
		expect(list.map((a) => a.submissionId)).toEqual(['s1']);
		expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
			`GET ${ACHIEVEMENTS_ADDRESS}units/unit-1/submissions?status=pending`
		]);
	});

	it('sends exactly what Terrain’s Approvals tab sends, as the leader', async () => {
		const { terrain, writes } = await signedInTerrain(unit([submission('s1')]));
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [approval] = await service.pending('unit-1');

		const result = await service.approve(approval);

		expect(result.success).toBe(true);
		expect(writes.map((w) => [w.method, w.url, w.body])).toEqual([
			[
				'POST',
				`${ACHIEVEMENTS_ADDRESS}submissions/s1/assessments`,
				'{"outcome":"approved","comment":""}'
			]
		]);
		// Approving is done as the leader, never as the youth
		expect(writes.some((w) => w.url.includes('assume-profiles'))).toBe(false);
		expect(writes[0].headers['Content-Type']).toBe('application/json');
	});

	it('only counts it approved when Terrain answers 204, as its own app expects', async () => {
		const { terrain } = await signedInTerrain({
			...unit([submission('s1')]),
			override: (call) => (call.url.endsWith('/assessments') ? { status: 200 } : undefined)
		});
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [approval] = await service.pending('unit-1');
		expect((await service.approve(approval)).success).toBe(false);
	});

	it('doesn’t send anything Terrain says the leader can’t action', async () => {
		const { terrain, writes } = await signedInTerrain(unit([submission('s1', { write: false })]));
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [approval] = await service.pending('unit-1');
		expect(await service.approve(approval)).toMatchObject({ success: false, status: 0 });
		expect(writes).toEqual([]);
	});

	it('knows the signed in leader, to tell whether they have voted', async () => {
		const { terrain } = await signedInTerrain(unit([]));
		expect(
			new ApprovalsService({ terrain, profiles: leaderProfiles() } as never).leaderMemberId()
		).toBe('leader-1');
	});
});

describe('the badge for approvals waiting for the leader', () => {
	const list = () =>
		pendingApprovals([
			submission('mine', { votes: [['l2', 'Kim Leader', 'approved']] }),
			submission('voted', { votes: [['leader-1', 'Sam Leader', 'approved']] }),
			submission('improve', { votes: [['leader-1', 'Sam Leader', 'feedback']] }),
			submission('not-mine', { write: false })
		]);

	it('counts only what the leader may approve and hasn’t voted on', () => {
		expect(waitingForLeader(list(), 'leader-1')).toBe(1);
		expect(waitingForLeader(list(), 'someone-else')).toBe(3);
		expect(waitingForLeader([], 'leader-1')).toBe(0);
	});

	it('loads once per unit, and follows what the Approvals page loads', async () => {
		const { terrain, calls } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			submissions: [submission('a'), submission('b')]
		});
		const badge = new ApprovalsBadge(
			new ApprovalsService({ terrain, profiles: leaderProfiles() } as never)
		);
		await badge.loadIfNeeded('unit-1');
		await badge.loadIfNeeded('unit-1');
		expect(badge).toMatchObject({ unitId: 'unit-1', waiting: 2 });
		expect(calls.filter((c) => c.url.includes('/submissions')).length).toBe(1);

		badge.update('unit-1', list());
		expect(badge.waiting).toBe(1);
		badge.clear();
		expect(badge).toMatchObject({ unitId: '', waiting: 0 });
	});

	it('stays off when Terrain can’t be reached', async () => {
		const { terrain } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			override: (call) => (call.url.includes('/submissions') ? new Error('offline') : undefined)
		});
		const badge = new ApprovalsBadge(
			new ApprovalsService({ terrain, profiles: leaderProfiles() } as never)
		);
		await badge.loadIfNeeded('unit-1');
		expect(badge).toMatchObject({ unitId: '', waiting: 0 });
	});
});

describe('awards', () => {
	const award = (write = true) => {
		const item = submission('aw', { votes: [], write });
		item.submission.type = 'award';
		return item;
	};
	const awardTerrain = (item = award()) =>
		signedInTerrain({ profiles: leaderProfiles(), members: [], records: {}, submissions: [item] });

	it('marks Terrain’s award submissions, and counts those the leader can award as waiting', () => {
		const [item] = pendingApprovals([award()]);
		expect(item).toMatchObject({ isAward: true, canAction: true, submissionType: 'Award' });
		expect(waitingForLeader([item], 'leader-1')).toBe(1);
		expect(waitingForLeader(pendingApprovals([award(false)]), 'leader-1')).toBe(0);
	});

	it('never sends an award a review vote', async () => {
		const { terrain, writes } = await awardTerrain();
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [item] = await service.pending('unit-1');
		expect(await service.approve(item)).toMatchObject({ success: false, status: 0 });
		expect(writes).toEqual([]);
	});

	it('sends exactly what Terrain’s Approvals tab sends to award, as the leader', async () => {
		const { terrain, writes } = await awardTerrain();
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [item] = await service.pending('unit-1');

		const result = await service.award(item, '2020-10-25');

		expect(result.success).toBe(true);
		expect(writes.map((w) => [w.method, w.url, w.body])).toEqual([
			[
				'POST',
				`${ACHIEVEMENTS_ADDRESS}submissions/aw/assessments`,
				'{"outcome":"awarded","date_awarded":"2020-10-25"}'
			]
		]);
		expect(writes.some((w) => w.url.includes('assume-profiles'))).toBe(false);
		expect(writes[0].headers['Content-Type']).toBe('application/json');
	});

	it('doesn’t award a review, one Terrain says the leader can’t action, or a bad date', async () => {
		const { terrain, writes } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			submissions: [award(false), submission('s1')]
		});
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const list = await service.pending('unit-1');
		const locked = list.find((a) => a.isAward)!;
		const review = list.find((a) => !a.isAward)!;
		expect(await service.award(locked, '2020-10-25')).toMatchObject({ success: false });
		expect(await service.award(review, '2020-10-25')).toMatchObject({ success: false });
		const open = { ...locked, canAction: true };
		expect(await service.award(open, '')).toMatchObject({ success: false });
		expect(await service.award(open, '2999-01-01')).toMatchObject({ success: false });
		expect(writes).toEqual([]);
	});

	it('takes award dates as real days up to today, in the leader’s time zone', () => {
		const now = new Date(2026, 9, 25, 23, 30);
		expect(localDate(now)).toBe('2026-10-25');
		expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
		expect(isAwardDate('2026-10-25', now)).toBe(true);
		expect(isAwardDate('2026-02-28', now)).toBe(true);
		expect(isAwardDate('2026-10-26', now)).toBe(false);
		expect(isAwardDate('2026-02-30', now)).toBe(false);
		expect(isAwardDate('25/10/2026', now)).toBe(false);
		expect(isAwardDate('', now)).toBe(false);
	});
});

describe('moving a special interest area plan on to the review', () => {
	const sia = (votes: [string, string, string][] = [['l2', 'Kim Leader', 'approved']]) =>
		submission('sp', {
			type: 'special_interest_area',
			meta: { sia_area: 'sia_art_literature' },
			votes
		});
	const plan = (extra: Partial<TerrainAchievement> = {}): TerrainAchievement => ({
		id: 'ach-sp',
		type: 'special_interest_area',
		status: 'draft_review',
		template: 'sia/cub/plan',
		version: 2,
		section: 'cub',
		last_updated: '2026-10-20T09:15:00.000Z',
		answers: {
			attach_documentation: [],
			project_name: 'Bracelet making business',
			special_interest_area_selection: 'sia_art_literature'
		},
		uploads: [],
		...extra
	});
	const siaTerrain = (record: TerrainAchievement | null, item = sia()) =>
		signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: { m1: { special_interest_area: record ? [record] : [] } },
			submissions: [item]
		});

	it('is offered only on the deciding approval of a special interest area', () => {
		const [deciding] = pendingApprovals([sia()]);
		const [first] = pendingApprovals([sia([])]);
		const [oas] = pendingApprovals([
			submission('o', { votes: [['l2', 'Kim Leader', 'approved']] })
		]);
		expect(mayMoveToReview(deciding)).toBe(true);
		expect(mayMoveToReview(first)).toBe(false);
		expect(mayMoveToReview(oas)).toBe(false);
	});

	it('knows a plan by its template, and sends it as it stands, not reset to draft', () => {
		expect(isSIAPlan(plan())).toBe(true);
		expect(isSIAPlan(plan({ template: 'sia/cub/review' }))).toBe(false);
		expect(isSIAPlan(plan({ status: 'awarded' }))).toBe(false);
		expect(JSON.stringify(moveToReviewBody(plan()))).toBe(
			'{"achievement_type":"special_interest_area","template":"sia/cub/plan","version":2,"section":"cub","answers":{"attach_documentation":[],"project_name":"Bracelet making business","special_interest_area_selection":"sia_art_literature"},"uploads":[],"reset_to_draft":false}'
		);
	});

	it('sends exactly what Terrain sends, as the youth, after the approval', async () => {
		const { terrain, writes, calls } = await siaTerrain(plan());
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [approval] = await service.pending('unit-1');

		expect((await service.approve(approval)).success).toBe(true);
		const moved = await service.moveToReview(approval);

		expect(moved).toMatchObject({ success: true, moved: true });
		expect(writes.map((w) => [w.method, w.url, w.body])).toEqual([
			[
				'POST',
				`${ACHIEVEMENTS_ADDRESS}submissions/sp/assessments`,
				'{"outcome":"approved","comment":""}'
			],
			[
				'PUT',
				`${ACHIEVEMENTS_ADDRESS}members/m1/achievements/ach-sp`,
				JSON.stringify(moveToReviewBody(plan()))
			]
		]);
		// Sent between switching to the youth and back
		const urls = calls.map((c) => c.url);
		const put = urls.indexOf(`${ACHIEVEMENTS_ADDRESS}members/m1/achievements/ach-sp`);
		expect(urls.slice(0, put).some((u) => u.endsWith('/members/m1/assume-profiles'))).toBe(true);
		expect(urls.slice(put).some((u) => u.endsWith('revoke-assumed-profiles'))).toBe(true);
	});

	it('leaves a record alone that isn’t the plan any more, or isn’t there', async () => {
		for (const record of [plan({ template: 'sia/cub/review' }), null]) {
			const { terrain, writes } = await siaTerrain(record);
			const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
			const [approval] = await service.pending('unit-1');
			expect(await service.moveToReview(approval)).toMatchObject({ success: true, moved: false });
			expect(writes).toEqual([]);
		}
	});

	it('sends nothing unless it is the deciding approval', async () => {
		const { terrain, writes } = await siaTerrain(plan(), sia([]));
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [approval] = await service.pending('unit-1');
		expect(await service.moveToReview(approval)).toMatchObject({ success: false, moved: false });
		expect(writes).toEqual([]);
	});

	it('says so when Terrain won’t switch to the youth', async () => {
		const { terrain, writes } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: { m1: { special_interest_area: [plan()] } },
			submissions: [sia()],
			override: (call) => (call.url.endsWith('/assume-profiles') ? { status: 403 } : undefined)
		});
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		const [approval] = await service.pending('unit-1');
		expect(await service.moveToReview(approval)).toMatchObject({
			success: false,
			status: 403,
			moved: false
		});
		expect(writes).toEqual([]);
	});
});

describe('showing what the leader just did', () => {
	const sam = { memberId: 'leader-1', name: 'Sam Leader' };
	const list = () =>
		pendingApprovals([
			submission('a'),
			submission('b', { votes: [['l2', 'Kim Leader', 'approved']] }),
			submission('c')
		]);
	const done = (entries: [string, Actioned][]) => new Map(entries);

	it('adds the leader’s vote Terrain doesn’t list yet, and says it lags', () => {
		const shown = withActioned(list(), done([['a', { action: 'voted', wasAward: false }]]), sam);
		expect(shown.list.find((a) => a.submissionId === 'a')?.approvedBy).toEqual([sam]);
		expect(shown.lagging).toEqual(['a']);
	});

	it('leaves out what went through, while Terrain still lists it', () => {
		const shown = withActioned(list(), done([['b', { action: 'done', wasAward: false }]]), sam);
		expect(shown.list.map((a) => a.submissionId)).toEqual(['a', 'c']);
		expect(shown.lagging).toEqual(['b']);
	});

	it('stops once Terrain shows it', () => {
		const voted = pendingApprovals([
			submission('a', { votes: [['leader-1', 'Sam Leader', 'approved']] })
		]);
		const actions = done([
			['a', { action: 'voted', wasAward: false }],
			['gone', { action: 'done', wasAward: false }]
		]);
		const shown = withActioned(voted, actions, sam);
		expect(shown.list[0].approvedBy).toHaveLength(1);
		expect(shown.lagging).toEqual([]);
	});

	it('shows a review that went through and came back as an award', () => {
		const [item] = pendingApprovals([submission('b')]);
		const award = { ...item, isAward: true };
		const shown = withActioned([award], done([['b', { action: 'done', wasAward: false }]]), sam);
		expect(shown.list).toEqual([award]);
		expect(shown.lagging).toEqual([]);
	});
});

describe('the history', () => {
	const finalised = (
		id: string,
		outcome: string,
		votes: [string, string, string, string][],
		date = '2026-10-01T00:00:00Z'
	): TerrainSubmission => {
		const item = submission(id, { status: 'finalised', date });
		item.submission.outcome = outcome;
		item.submission.actioned_by = votes.map(([member_id, name, voteOutcome, time]) => ({
			member_id,
			member_first_name: name.split(' ')[0],
			member_last_name: name.split(' ')[1],
			outcome: voteOutcome,
			time
		}));
		return item;
	};

	it('keeps only finalised submissions, most recently decided first, dated by the last vote', () => {
		const list = decidedSubmissions([
			finalised('a', 'approved', [
				['l1', 'Sam Leader', 'approved', '2026-10-05T10:00:00Z'],
				['l2', 'Kim Leader', 'approved', '2026-10-06T10:00:00Z']
			]),
			finalised('b', 'feedback', [['l2', 'Kim Leader', 'feedback', '2026-10-20T10:00:00Z']]),
			// No vote times: the submission's own date stands in
			finalised('c', 'approved', [], '2026-10-10T00:00:00Z'),
			submission('pending')
		]);
		expect(list.map((h) => [h.submissionId, h.decidedOn])).toEqual([
			['b', '2026-10-20T10:00:00.000Z'],
			['c', '2026-10-10T00:00:00Z'],
			['a', '2026-10-06T10:00:00.000Z']
		]);
		expect(list[2]).toMatchObject({
			achievementName: 'OAS Bushwalking 3',
			memberName: 'Ava Nguyen',
			outcome: 'approved',
			approvedBy: [
				{ memberId: 'l1', name: 'Sam Leader' },
				{ memberId: 'l2', name: 'Kim Leader' }
			]
		});
		expect(list[0].improveBy).toEqual([{ memberId: 'l2', name: 'Kim Leader' }]);
	});

	it('names outcomes, and tells what is recent', () => {
		expect(outcomeDisplay('approved')).toBe('Approved');
		expect(outcomeDisplay('feedback')).toBe('Needs improvement');
		expect(outcomeDisplay('withdrawn')).toBe('Withdrawn');
		expect(outcomeDisplay('')).toBe('Finalised');
		const [item] = decidedSubmissions([finalised('a', 'approved', [], '2026-08-01T00:00:00Z')]);
		expect(decidedWithin(item, 90, new Date('2026-10-25T00:00:00Z'))).toBe(true);
		expect(decidedWithin(item, 30, new Date('2026-10-25T00:00:00Z'))).toBe(false);
	});

	it('loads the unit’s finalised submissions from Terrain', async () => {
		const { terrain, calls } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			submissions: [finalised('a', 'approved', [])]
		});
		const service = new ApprovalsService({ terrain, profiles: leaderProfiles() } as never);
		expect((await service.history('unit-1')).map((h) => h.submissionId)).toEqual(['a']);
		expect(calls.map((c) => c.url)).toEqual([
			`${ACHIEVEMENTS_ADDRESS}units/unit-1/submissions?status=finalised`
		]);
	});
});
