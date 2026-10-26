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

describe('saving an activity', () => {
	it('adds it to the unit’s programme as the leader', async () => {
		const { terrain, writes, calls } = await signedInTerrain({
			profiles: leaderProfiles(),
			members: [],
			records: {}
		});
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);

		const result = await service.save(camp(), 'unit-1', 'Australia/Adelaide');

		expect(result.success).toBe(true);
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
		const result = await service.save({ ...camp(), title: '' }, 'unit-1');
		expect(result).toMatchObject({ success: false, status: 0, body: 'Give the activity a title.' });
		expect(await service.save(camp(), '')).toMatchObject({ success: false });
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
		expect(await service.save(camp(), 'unit-1')).toMatchObject({ success: false, status: 403 });
	});
});
