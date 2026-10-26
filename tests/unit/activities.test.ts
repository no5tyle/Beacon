import { describe, expect, it } from 'vitest';
import { newActivity } from '#lib/model/activity.js';
import { ActivitiesService } from '#lib/services/activities.js';
import { EVENTS_ADDRESS } from '#lib/terrain/client.js';
import { leaderProfiles, signedInTerrain } from './fakeTerrain.js';

const camp = () => ({
	...newActivity('Camp', '2026-10-23'),
	title: 'Spring camp',
	challengeArea: 'Outdoors' as const,
	attendance: { m1: 'Participant' as const }
});
// Before the camp, and after it
const before = new Date(2026, 9, 1);
const after = new Date(2026, 9, 30);
const reviewed = () => ({
	...camp(),
	review: { rating: 'great' as const, method: ['nature_and_outdoors'], spices: ['physical'] }
});

describe('saving an activity', () => {
	it('adds it to the unit’s programme as the leader', async () => {
		const { terrain, writes, calls } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {}
		});
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);

		const result = await service.save(camp(), 'unit-1', 'Australia/Adelaide', before);

		expect(result).toMatchObject({ success: true, concluded: false });
		expect(writes.map((w) => [w.method, w.url])).toEqual([
			['POST', `${EVENTS_ADDRESS}units/unit-1/events`]
		]);
		const body = JSON.parse(writes[0].body!);
		expect(body).toMatchObject({
			organisers: ['leader-1'],
			achievement_pathway_oas_data: { verifier: { name: 'Sam Leader' } },
			iana_timezone: 'Australia/Adelaide'
		});
		expect(writes[0].headers['Content-Type']).toBe('application/json');
		// Added as the leader, never as a youth
		expect(calls.some((c) => c.url.includes('assume-profiles'))).toBe(false);
	});

	it('sends nothing for an activity that isn’t finished', async () => {
		const { terrain, writes } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {}
		});
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);
		const result = await service.save({ ...camp(), title: '' }, 'unit-1', undefined, before);
		expect(result).toMatchObject({ success: false, status: 0, body: 'Give the activity a title.' });
		expect(await service.save(camp(), '', undefined, before)).toMatchObject({ success: false });
		// Over, it needs its review first
		expect(await service.save(camp(), 'unit-1', undefined, after)).toMatchObject({
			success: false,
			body: 'Say how it went. Tick the Scout method it used. Tick the SPICES it developed.'
		});
		expect(writes).toEqual([]);
	});

	it('says why when Terrain refuses it', async () => {
		const { terrain } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			override: (call) => (call.url.includes('/events') ? { status: 403 } : undefined)
		});
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);
		expect(await service.save(camp(), 'unit-1', undefined, before)).toMatchObject({
			success: false,
			status: 403
		});
	});

	const withId = (patch?: number) =>
		signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {},
			override: (call) =>
				call.method === 'POST' && call.url.endsWith('/events')
					? { status: 200, body: { id: 'event-9', title: 'Spring camp' } }
					: call.method === 'PATCH' && patch
						? { status: patch }
						: undefined
		});

	it('concludes one that’s over, with its review, using the id Terrain gives it', async () => {
		const { terrain, writes } = await withId();
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);

		const result = await service.save(reviewed(), 'unit-1', 'Australia/Adelaide', after);

		expect(result).toMatchObject({ success: true, concluded: true, concludeFailed: false });
		// Overrides answer before the fake records writes, so only the conclude shows here
		expect(writes.map((w) => [w.method, w.url])).toEqual([
			['PATCH', `${EVENTS_ADDRESS}events/event-9`]
		]);
		expect(JSON.parse(writes[0].body!)).toMatchObject({
			status: 'concluded',
			review: {
				scout_method_elements: ['nature_and_outdoors'],
				scout_spices_elements: ['physical'],
				general_rating: 'great'
			}
		});
	});

	it('keeps it planned and says so when concluding fails, or Terrain gives no id', async () => {
		const refused = await withId(400);
		const service = new ActivitiesService({
			terrain: refused.terrain,
			profiles: leaderProfiles()
		} as never);
		expect(await service.save(reviewed(), 'unit-1', undefined, after)).toMatchObject({
			success: true,
			concluded: false,
			concludeFailed: true,
			status: 400
		});

		const { terrain } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {}
		});
		const noId = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);
		expect(await noId.save(reviewed(), 'unit-1', undefined, after)).toMatchObject({
			success: true,
			concluded: false,
			concludeFailed: true,
			body: "Terrain didn't say its id."
		});
	});
});
