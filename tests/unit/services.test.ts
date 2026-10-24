// The data services against a fake Terrain holding a made-up unit
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerrainAchievement } from '#lib/terrain/types.js';
import type { BeaconContext } from '#lib/services/context.js';
import { sectionFromProfiles } from '#lib/services/context.js';
import { MembersService, toMemberSummary, youthSelf } from '#lib/services/members.js';
import {
	OASService,
	stagesFromTree,
	worksheetAnswers,
	type TemplateRow
} from '#lib/services/oas.js';
import {
	milestoneSummaries,
	oasSummaries,
	progressFromDetails,
	siaSummaries,
	ProgressService
} from '#lib/services/progress.js';
import { RecordingService } from '#lib/services/recording.js';
import { UnitProgressService, youthProgress } from '#lib/services/unitProgress.js';
import { AppState } from '#lib/stores/app.svelte.js';
import { Terrain } from '#lib/terrain/client.js';
import {
	leaderProfiles,
	member,
	signedInTerrain,
	fakeTerrain,
	type FakeUnit
} from './fakeTerrain.js';

const record = (type: string, fields: Partial<TerrainAchievement>): TerrainAchievement => ({
	id: `${type}-${Math.random().toString(36).slice(2)}`,
	type,
	status: 'awarded',
	section: 'scout',
	status_updated: '2025-05-10T00:00:00Z',
	...fields
});
const oasRecord = (stream: string, stage: number, fields: Partial<TerrainAchievement> = {}) =>
	record('outdoor_adventure_skill', {
		achievement_meta: { stream, branch: stream, stage },
		...fields
	});

function context(
	terrain: Terrain,
	unit: FakeUnit,
	overrides: Partial<BeaconContext> = {}
): BeaconContext {
	return {
		terrain,
		isSignedIn: true,
		isYouth: false,
		profiles: unit.profiles,
		user: { UserAttributes: [{ Name: 'email', Value: 'sam@example.com' }] },
		suppressLastName: false,
		unitId: 'unit-1',
		sectionOf: (unitId) => sectionFromProfiles(unit.profiles, unitId),
		...overrides
	};
}

describe('members', () => {
	it('summarises a unit member as the Blazor app did', () => {
		const summary = toMemberSummary(
			member('m1', 'Ava', 'Nguyen', {
				date_of_birth: '2013-03-15',
				unit: { id: 'u', section: 'scout', duty: 'member', unit_council: true },
				patrol: { id: 'p', name: 'Wombat', duty: 'assistant_patrol_leader' }
			}),
			'2026-10-22'
		);

		expect(summary).toMatchObject({
			id: 'm1',
			firstName: 'Ava',
			age: '13y 7m',
			dateOfBirth: '2013-03-15',
			unitCouncil: true,
			patrolName: 'Wombat',
			patrolDuty: 'APL',
			patrolOrder: 2,
			isAdultLeader: false
		});
		expect(
			toMemberSummary(
				member('m2', 'Pat', 'Leader', {
					unit: { id: 'u', section: 'scout', duty: 'adult_leader', unit_council: false }
				})
			).isAdultLeader
		).toBe(true);
		expect(
			toMemberSummary(member('m3', 'No', 'Birthday', { date_of_birth: '' })).age,
			'no birthday, no crash'
		).toBe('');
	});

	it('gives a youth member only themselves, from their profile', () => {
		const self = youthSelf({
			username: 'SA-7654321',
			profiles: [{ member: { id: 'y1', name: 'Ava Nguyen' } }]
		});

		expect(self).toMatchObject({
			id: 'y1',
			memberNumber: '7654321',
			firstName: 'Ava',
			lastName: 'Nguyen'
		});
	});

	it('loads the unit once and hides last names when asked', async () => {
		const unit: FakeUnit = {
			profiles: leaderProfiles(),
			members: [member('m1', 'Ava', 'Nguyen')],
			records: {}
		};
		const { terrain, calls } = await signedInTerrain(unit);
		const ctx = { ...context(terrain, unit), suppressLastName: true };
		const service = new MembersService(ctx);

		await service.get('unit-1');
		const members = await service.get('unit-1');

		expect(calls.filter((c) => c.url.includes('/members')).length).toBe(1);
		expect(service.displayName(members[0])).toBe('Ava N');
	});
});

describe('unit progress', () => {
	it("builds a youth's progress from their Terrain records", () => {
		const progress = youthProgress(
			toMemberSummary(member('m1', 'Ava', 'Nguyen')),
			'Ava Nguyen',
			{
				milestones: [
					record('milestone', {
						achievement_meta: { stage: 1 },
						status: 'awarded',
						status_updated: '2025-02-01T00:00:00Z'
					}),
					record('milestone', {
						achievement_meta: { stage: 2 },
						status: 'in_progress',
						event_count: {
							participant: { community: 2, outdoors: 3, creative: 1, personal_growth: 2 },
							assistant: { community: 1 },
							leader: { outdoors: 2 }
						}
					}),
					record('milestone', { achievement_meta: { stage: 3 }, section: 'cub', status: 'awarded' })
				],
				oas: [
					oasRecord('bushwalking', 1),
					oasRecord('bushwalking', 2),
					oasRecord('camping', 7),
					oasRecord('bushcraft', 2, { section: 'cub' }),
					oasRecord('bushwalking', 3, { status: 'in_progress' }),
					oasRecord('bushwalking', 3, { status: 'draft_review' })
				],
				sia: [
					record('special_interest_area', {
						answers: { special_interest_area_selection: 'sia_environment' }
					}),
					record('special_interest_area', {
						answers: { special_interest_area_selection: 'sia_environment' }
					}),
					record('special_interest_area', {
						answers: { special_interest_area_selection: 'sia_art_literature' }
					}),
					record('special_interest_area', {
						status: 'draft_review',
						answers: { special_interest_area_selection: 'sia_better_world' }
					})
				],
				introScouting: [record('intro_scouting', { imported: { date_awarded: '2020-03-01' } })],
				introSection: [
					record('intro_section', { section: 'cub' }),
					record('intro_section', { status_updated: '2024-02-10T00:00:00Z' })
				],
				courseReflection: [],
				adventurousJourney: [
					record('adventurous_journey', { status_updated: '2026-01-15T00:00:00Z' })
				],
				personalReflection: [record('personal_reflection', { status: 'in_progress' })],
				logbook: [
					{ name: 'total_nights_camped', value: 12.8 },
					{ name: 'total_distance_hiked', value: 42950 }
				]
			},
			'scout'
		);

		expect(progress).toMatchObject({
			memberName: 'Ava Nguyen',
			memberPatrol: 'Kookaburra',
			milestone1Awarded: '2025-02-01',
			milestone1Community: 6,
			milestone1Lead: 2,
			milestone2Awarded: null,
			milestone2Community: 2,
			milestone2Outdoors: 3,
			milestone2Assist: 0,
			milestone2Lead: 3,
			milestone3Awarded: null,
			oasBushwalkingStage: 2,
			oasCampingStage: 7,
			oasBushcraftStage: 2,
			oasSectionStagesAwarded: [1, 2, 7],
			oasStageProgressions: 4,
			oasStagesInProgress: ['bushwalking/3'],
			introToScouting: '2020-03-01',
			introToSection: '2024-02-10',
			nightsCamped: 12,
			kMsHiked: 42,
			siaEnvironment: 2,
			siaArtsLiterature: 1,
			siaCreatingABetterWorld: 0,
			adventurousJourney: '2026-01-15',
			personalReflection: null
		});
	});

	const unitWith = (count: number): FakeUnit => ({
		profiles: leaderProfiles(),
		members: Array.from({ length: count }, (_, i) => member(`m${i}`, `Youth${i}`, `Last${i}`)),
		records: {}
	});

	it('shares one load between callers and reports progress', async () => {
		const unit = unitWith(3);
		const { terrain, calls } = await signedInTerrain(unit);
		const ctx = context(terrain, unit);
		const service = new UnitProgressService(ctx, new MembersService(ctx));
		const seen: number[] = [];
		service.onProgress(() => seen.push(service.loadProgress('unit-1').done));

		const [a, b] = await Promise.all([service.get('unit-1'), service.get('unit-1')]);

		expect(a).toBe(b);
		expect(a.map((p) => p.memberName)).toEqual(['Youth0 Last0', 'Youth1 Last1', 'Youth2 Last2']);
		expect(calls.filter((c) => c.url.includes('type=milestone')).length).toBe(3);
		expect(seen).toEqual([0, 1, 2, 3]);
		expect(service.isCached('unit-1')).toBe(true);
	});

	it('keeps nothing from a load still running when everything is forgotten', async () => {
		const unit = unitWith(3);
		const { terrain } = await signedInTerrain(unit);
		const ctx = context(terrain, unit);
		const service = new UnitProgressService(ctx, new MembersService(ctx));

		const load = service.get('unit-1');
		service.clear();

		await expect(load).rejects.toThrow('Logged out');
		expect(service.isCached('unit-1')).toBe(false);
	});
});

describe('OAS worksheet', () => {
	const rows: TemplateRow[] = ['p1', 'd1', 'logbook_up_to_date'].map((inputId, id) => ({
		id,
		templateName: 'oas/bushwalking/3',
		templateTitle: 'Stage 3 - Bushwalking',
		inputGroup: inputId === 'p1' ? 'Plan>' : inputId === 'd1' ? 'Do>' : 'Verify>',
		inputGroupSort: inputId === 'p1' ? 1 : inputId === 'd1' ? 2 : 4,
		inputId,
		inputLabel: `Label ${inputId}`,
		inputDetail: ''
	}));
	const people = ['a', 'b', 'c', 'd'].map((id) =>
		toMemberSummary(member(id, id.toUpperCase(), 'Smith'))
	);
	const name = (m: { firstName: string }) => m.firstName;
	const answer = (list: ReturnType<typeof worksheetAnswers>, memberId: string, inputId: string) =>
		list.find((a) => a.memberId === memberId && a.inputId === inputId)!;

	it("marks who has done what, as the Blazor app's worksheet did", () => {
		const records = [
			oasRecord('bushwalking', 3, {
				member_id: 'a',
				status: 'draft_review',
				answers: { p1: true, p1_verifiedDate: '01/10/2026' }
			}),
			// In progress records count nothing, exactly as the Blazor app did
			oasRecord('bushwalking', 3, {
				member_id: 'b',
				status: 'in_progress',
				answers: { p1: true, p1_verifiedDate: '01/10/2026' }
			}),
			oasRecord('bushwalking', 3, { member_id: 'c', status: 'awarded', answers: {} }),
			oasRecord('bushwalking', 3, {
				member_id: 'd',
				status: 'awarded',
				answers: { d1_verifiedDate: '02/02/2025' }
			})
		];

		const list = worksheetAnswers(rows, records, people, name);

		expect(list.length).toBe(12);
		expect(list.map((a) => a.inputId).slice(0, 4)).toEqual(['p1', 'p1', 'p1', 'p1']);
		expect(answer(list, 'a', 'p1')).toMatchObject({
			answered: true,
			awarded: false,
			memberAnswer: '01/10/2026'
		});
		expect(answer(list, 'a', 'd1').answered).toBe(false);
		expect(answer(list, 'b', 'p1').answered).toBe(false);
		expect(
			list
				.filter((a) => a.memberId === 'c')
				.every((a) => a.answered && a.awarded && a.memberAnswer === '10/05/25')
		).toBe(true);
		expect(answer(list, 'd', 'd1')).toMatchObject({ answered: true, awarded: true });
		expect(answer(list, 'd', 'p1').answered).toBe(false);
	});

	it('lists every stage of a stream from its tree, in order', () => {
		const stages = stagesFromTree('Alpine', {
			branch_id: 'alpine',
			title: 'Alpine',
			stage: 1,
			template_link: 'oas/alpine/1/latest.json',
			children: [
				{
					branch_id: 'skiing',
					title: 'Skiing',
					stage: 4,
					template_link: 'oas/alpine/skiing/4/latest.json'
				},
				{
					branch_id: 'alpine',
					title: 'Alpine',
					stage: 4,
					template_link: 'oas/alpine/4/latest.json'
				}
			]
		});

		expect(stages.map((s) => s.selectListItemText)).toEqual([
			'Alpine 1',
			'Alpine Skiing 4',
			'Alpine 4'
		]);
		expect(OASService.findStage(stages, 'alpine', 4)?.branch, 'prefers the main branch').toBe(
			'alpine'
		);
	});
});

describe('youth progress details', () => {
	it('summarises milestones with their activities', () => {
		const [summary] = milestoneSummaries(
			[
				record('milestone', {
					achievement_meta: { stage: 1 },
					status: 'in_progress',
					imported: {
						date_awarded: '2021-01-01',
						event_count: { participant: { community: 2 }, leader: { outdoors: 1 } }
					},
					event_log: [
						...Array.from({ length: 8 }, (_, i) => ({
							credit_type: 'participant',
							challenge_area: 'outdoors',
							event_name: `Hike ${i}`,
							event_start_datetime: `2025-0${i + 1}-01T09:00:00+10:30`
						})),
						{
							credit_type: 'assistant',
							challenge_area: 'creative',
							event_name: 'Craft',
							event_start_datetime: '2025-03-01T09:00:00'
						}
					]
				})
			],
			'scout'
		);

		expect(summary.status).toBe('In Progress');
		expect(summary.participateLogs.filter((l) => l.eventName === 'Imported').length).toBe(2);
		expect(
			summary.participateLogs.filter((l) => l.challengeArea === 'outdoors').length,
			'only 6 count per area'
		).toBe(6);
		expect(summary.participateLogs.find((l) => l.eventName === 'Hike 0')!.eventDate).toBe(
			'2025-01-01'
		);
		expect(summary.leadLogs.map((l) => l.eventName)).toEqual(['Imported', 'Craft']);
	});

	it('counts OAS progressions in the section, with Stage 7 and above twice', () => {
		const result = oasSummaries(
			[
				oasRecord('camping', 7),
				oasRecord('bushwalking', 2),
				oasRecord('bushwalking', 3, { status: 'approved' }),
				oasRecord('bushcraft', 1, { section: 'cub' })
			],
			'scout'
		);

		expect(result.progressions).toBe(4);
		expect(result.summaries.map((s) => `${s.stream}${s.stage}`)).toEqual([
			'bushcraft1',
			'bushwalking2',
			'bushwalking3',
			'camping7'
		]);
		expect(result.summaries[2]).toMatchObject({
			awarded: null,
			approved: '2025-05-10',
			section: 's'
		});
	});

	it('names SIA areas and turns the details back into progress for Insights', () => {
		const sia = siaSummaries(
			[
				record('special_interest_area', {
					answers: { special_interest_area_selection: 'sia_art_literature', project_name: 'Mural' }
				})
			],
			'scout'
		);
		expect(sia[0]).toMatchObject({ area: 'Art Literature', project: 'Mural', status: 'Awarded' });

		const progress = progressFromDetails(
			{
				member: toMemberSummary(member('m1', 'Ava', 'Nguyen')),
				introToScouting: '2020-01-01',
				introToSection: null,
				milestones: [
					{
						milestone: 1,
						status: 'Not Required',
						awarded: null,
						participateLogs: [],
						assistLogs: [],
						leadLogs: []
					}
				],
				oasSummaries: oasSummaries(
					[oasRecord('camping', 2), oasRecord('camping', 3, { status: 'in_progress' })],
					'scout'
				).summaries,
				stats: { oasProgressions: 1, kmsHiked: 0, nightsCamped: 0, nightsCampedInSection: 0 },
				siaSummaries: sia,
				peakAward: {
					personalDevelopmentCourse: null,
					adventurousJourney: null,
					personalReflection: null,
					awarded: null
				}
			},
			'scout'
		);
		expect(progress.milestone1Awarded, 'not required counts as done').not.toBeNull();
		expect(progress.oasCampingStage).toBe(2);
		expect(progress.oasStagesInProgress).toEqual(['camping/3']);
		expect(progress.oasSectionStagesAwarded).toEqual([2]);
		expect(progress.siaArtsLiterature).toBe(1);
	});

	it('reads the logbook as the youth', async () => {
		const unit: FakeUnit = {
			profiles: leaderProfiles(),
			members: [member('m1', 'Ava', 'Nguyen')],
			records: { m1: { outdoor_adventure_skill: [oasRecord('bushwalking', 1)] } },
			logbook: {
				m1: [{ name: 'total_nights_camped', value: 5, last_updated: '2026-01-01T00:00:00Z' }]
			}
		};
		const { terrain, calls } = await signedInTerrain(unit);
		const ctx = context(terrain, unit);

		const details = await new ProgressService(ctx, new MembersService(ctx)).details('unit-1', 'm1');

		expect(details.stats).toEqual({
			oasProgressions: 1,
			kmsHiked: 0,
			nightsCamped: 5,
			nightsCampedInSection: 5
		});
		const order = calls.map((c) => c.url.replace(/.*\//, '').replace(/\?.*/, ''));
		expect(order.indexOf('assume-profiles')).toBeLessThan(order.indexOf('logbook-metrics'));
	});
});

describe('recording OAS', () => {
	const stage = {
		stream: 'Bushwalking',
		branch: 'bushwalking',
		stage: 3,
		stageTitle: '',
		templateLink: 'oas/bushwalking/3/latest.json',
		selectListItemText: ''
	};
	const template = {
		template: 'oas/bushwalking/3',
		meta: { stage: 3, stream: 'bushwalking' },
		version: 2,
		document: [
			{
				title: 'Stage 3',
				input_groups: [
					{
						title: 'Plan>',
						inputs: [{ id: 'p1', type: 'verifiable_checkbox', label: 'I can plan.' }]
					},
					{
						title: 'Verify>',
						inputs: [{ id: 'logbook_up_to_date', type: 'checkbox', label: 'Logbook' }]
					}
				]
			}
		]
	};
	const verifier = { type: 'member', name: 'Sam Leader', contact: 'sam@example.com' };

	async function setup(records: TerrainAchievement[], override?: FakeUnit['override']) {
		const unit: FakeUnit = {
			profiles: leaderProfiles(),
			members: [member('m1', 'Ava', 'Nguyen')],
			records: { m1: { outdoor_adventure_skill: records } },
			override: (call) =>
				override?.(call) ?? (call.url.endsWith('/latest.json') ? { body: template } : undefined)
		};
		const { terrain, writes, calls } = await signedInTerrain(unit);
		const ctx = context(terrain, unit);
		const members = new MembersService(ctx);
		const progress = new UnitProgressService(ctx, members);
		return { service: new RecordingService(ctx, progress), writes, calls, progress };
	}

	it('starts a record the youth hasn’t started, as the youth', async () => {
		const { service, writes, calls } = await setup([]);

		const outcome = await service.signOff('m1', stage, ['p1'], verifier);

		expect(outcome).toEqual({ state: 'Saved', savedCount: 1, message: '' });
		expect(writes.map((w) => `${w.method} ${w.url.replace(/.*members\//, '')}`)).toEqual([
			'POST m1/achievements'
		]);
		const body = JSON.parse(writes[0].body!);
		expect(body).toMatchObject({
			achievement_type: 'outdoor_adventure_skill',
			section: 'scout',
			achievement_meta: { stream: 'bushwalking', branch: 'bushwalking', stage: 3 }
		});
		expect(body.answers.p1_verifierName).toBe('Sam Leader');
		const order = calls.map((c) => c.url.replace(/.*\//, ''));
		expect(order.indexOf('assume-profiles')).toBeLessThan(order.indexOf('achievements'));
	});

	it('updates an existing record, keeping what Terrain has', async () => {
		const existing = oasRecord('bushwalking', 3, {
			id: 'ach-1',
			status: 'in_progress',
			last_updated: '2026-10-01T00:00:00Z',
			answers: { logbook_up_to_date: true },
			uploads: []
		});
		const { service, writes } = await setup([existing]);

		const outcome = await service.signOff('m1', stage, ['p1', 'logbook_up_to_date'], verifier);

		expect(outcome.savedCount).toBe(1);
		expect(writes[0].method).toBe('PUT');
		expect(writes[0].url).toMatch(/members\/m1\/achievements\/ach-1$/);
		expect(JSON.parse(writes[0].body!).last_updated).toBe('2026-10-01T00:00:00Z');
	});

	it('skips youth who already have the statements or whose stage is submitted', async () => {
		const done = oasRecord('bushwalking', 3, { status: 'in_progress', answers: { p1: true } });
		expect(
			(await (await setup([done])).service.signOff('m1', stage, ['p1'], verifier)).message
		).toBe('Already had these.');
		const submitted = oasRecord('bushwalking', 3, { status: 'pending_review' });
		expect(
			(await (await setup([submitted])).service.signOff('m1', stage, ['p1'], verifier)).message
		).toBe('Already submitted or complete.');
	});

	it('saves nothing when Terrain won’t switch to the youth', async () => {
		const { service, writes } = await setup([], (call) =>
			call.url.endsWith('/assume-profiles') ? { status: 403, body: '' } : undefined
		);

		const outcome = await service.signOff('m1', stage, ['p1'], verifier);

		expect(outcome.state).toBe('Failed');
		expect(outcome.message).toBe(
			"Terrain wouldn't let Beacon act as this youth, so nothing was saved. Terrain said 403."
		);
		expect(writes.filter((w) => w.url.includes('/achievements')).length).toBe(0);
	});

	it('forgets the unit’s progress after a save, so it loads again', async () => {
		const { service, progress } = await setup([]);
		const clear = vi.spyOn(progress, 'clear');

		await service.signOff('m1', stage, ['p1'], verifier);

		expect(clear).toHaveBeenCalledWith('unit-1');
	});

	it('records the signed in leader as the verifier', async () => {
		const { service } = await setup([]);

		expect(service.defaultVerifier()).toEqual({
			type: 'member',
			name: 'Sam Leader',
			contact: 'sam@example.com'
		});
	});
});

describe('app state', () => {
	let stored: Record<string, string>;
	beforeEach(() => {
		stored = {};
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => stored[key] ?? null,
			setItem: (key: string, value: string) => (stored[key] = value)
		});
	});

	const appFor = (unit: FakeUnit) => new AppState(new Terrain({ fetch: fakeTerrain(unit).fetch }));

	it('logs in a leader with one unit, choosing it straight away', async () => {
		const app = appFor({ profiles: leaderProfiles(), members: [], records: {} });

		expect(await app.login('sa', '1234567', 'secret')).toEqual({ ok: true });

		expect(app.isSignedIn).toBe(true);
		expect(app.isYouth).toBe(false);
		expect(app.memberName).toBe('Sam Leader');
		expect(app.groups).toEqual([{ id: 'group-1', name: '1st Example' }]);
		expect(app.groupName).toBe('1st Example');
		expect(app.unitId).toBe('unit-1');
		expect(app.section).toBe('scout');
		expect(app.user?.UserAttributes?.[0].Value).toBe('sam@example.com');
	});

	it('picks up the unit chosen last time, if it is still one of theirs', async () => {
		const units = [
			{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' },
			{ id: 'unit-2', name: 'Mt Example Cubs', section: 'cub' }
		];
		stored['beacon-unit'] = 'unit-2';
		const app = appFor({ profiles: leaderProfiles(units), members: [], records: {} });

		await app.login('sa', '1', 'x');

		expect(app.units.length).toBe(2);
		expect(app.unitId).toBe('unit-2');
		expect(app.section).toBe('cub');
		app.chooseUnit('unit-1');
		expect(stored['beacon-unit']).toBe('unit-1');
	});

	it('treats someone without leader roles as a youth member', async () => {
		const profiles = {
			username: 'SA-7',
			profiles: [
				{
					member: { id: 'y1', name: 'Ava Nguyen' },
					unit: { id: 'unit-1', name: 'Scouts', section: 'scout', roles: [] },
					group: { id: 'g', name: 'G', roles: [] }
				}
			]
		};
		const app = appFor({ profiles, members: [], records: {} });

		await app.login('sa', '7', 'x');

		expect(app.isYouth).toBe(true);
		expect(app.terrain.session?.isYouth).toBe(true);
	});

	it('shows Terrain’s reason for a refused login', async () => {
		const app = appFor({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			override: () => ({
				status: 400,
				body: { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' }
			})
		});

		expect(await app.login('sa', '1', 'wrong')).toEqual({
			ok: false,
			message: 'Incorrect username or password.'
		});
		expect(app.isSignedIn).toBe(false);
	});

	it('forgets everything on logout', async () => {
		const app = appFor({ profiles: leaderProfiles(), members: [], records: {} });
		const reset = vi.fn();
		app.onReset(reset);
		await app.login('sa', '1', 'x');

		app.logout();

		expect(app.isSignedIn).toBe(false);
		expect(app.profiles).toBeNull();
		expect(app.unitId).toBe('');
		expect(app.terrain.isSignedIn).toBe(false);
		expect(reset).toHaveBeenCalled();
	});
});
