import { describe, expect, it } from 'vitest';
import { newActivity } from '#lib/model/activity.js';
import { ActivitiesService } from '#lib/services/activities.js';
import { EVENTS_ADDRESS } from '#lib/terrain/client.js';
import { leaderProfiles, signedInTerrain } from './fakeTerrain.js';

const camp = () => ({
	...newActivity('2026-10-23'),
	multiDay: true,
	endDate: '2026-10-25',
	endTime: '12:00',
	title: 'Spring camp',
	location: 'Woodhouse',
	challengeArea: 'Outdoors' as const,
	attendance: { m1: 'Participant' as const }
});
// Before the camp, and after it
const before = new Date(2026, 9, 1);
const after = new Date(2026, 9, 30);
const reviewed = () => ({
	...camp(),
	review: {
		rating: 'great' as const,
		tags: ['fun'],
		method: ['nature_and_outdoors'],
		spices: ['physical']
	}
});
const terrainFor = (override?: Parameters<typeof signedInTerrain>[0]['override']) =>
	signedInTerrain({ profiles: leaderProfiles(), members: [], records: {}, override });

describe('saving an activity', () => {
	it('adds it to the unit’s programme already concluded, as the leader, in one request', async () => {
		const { terrain, writes, calls } = await terrainFor();
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);

		const result = await service.save(reviewed(), 'unit-1', 'Australia/Adelaide', after);

		expect(result.success).toBe(true);
		expect(writes.map((w) => [w.method, w.url])).toEqual([
			['POST', `${EVENTS_ADDRESS}units/unit-1/events`]
		]);
		expect(JSON.parse(writes[0].body!)).toMatchObject({
			status: 'concluded',
			organisers: ['leader-1'],
			achievement_pathway_oas_data: { verifier: { name: 'Sam Leader' } },
			review: {
				general_tags: ['fun'],
				scout_method_elements: ['nature_and_outdoors'],
				scout_spices_elements: ['physical'],
				general_rating: 'great'
			},
			iana_timezone: 'Australia/Adelaide'
		});
		expect(writes[0].headers['Content-Type']).toBe('application/json');
		// Added as the leader, never as a youth
		expect(calls.some((c) => c.url.includes('assume-profiles'))).toBe(false);
	});

	it('sends nothing for an activity that isn’t ready', async () => {
		const { terrain, writes } = await terrainFor();
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);
		const result = await service.save({ ...reviewed(), title: '' }, 'unit-1', undefined, after);
		expect(result).toMatchObject({ success: false, status: 0, body: 'Give the activity a title.' });
		expect(await service.save(reviewed(), '', undefined, after)).toMatchObject({ success: false });
		// Not over yet: Log activity takes only activities that are
		expect(await service.save(reviewed(), 'unit-1', undefined, before)).toMatchObject({
			success: false,
			body: "It hasn't finished yet. Log activities once they're over."
		});
		// It needs its review
		expect(await service.save(camp(), 'unit-1', undefined, after)).toMatchObject({
			success: false,
			body: 'Say how it went. Tick the Scout method it used. Tick the SPICES it developed.'
		});
		expect(writes).toEqual([]);
	});

	it('says why when Terrain refuses it', async () => {
		const { terrain } = await terrainFor((call) =>
			call.url.includes('/events') ? { status: 403 } : undefined
		);
		const service = new ActivitiesService({ terrain, profiles: leaderProfiles() } as never);
		expect(await service.save(reviewed(), 'unit-1', undefined, after)).toMatchObject({
			success: false,
			status: 403
		});
	});
});
