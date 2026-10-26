// A fake Terrain holding a made-up unit, answering requests the way Terrain does, for service tests
import { COGNITO_ADDRESS, Terrain } from '#lib/terrain/client.js';
import type {
	Profiles,
	TerrainAchievement,
	TerrainSubmission,
	UnitMember
} from '#lib/terrain/types.js';

export interface Call {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

export interface FakeUnit {
	profiles: Profiles;
	members: UnitMember[];
	/** Records per member per type, e.g. records.m1.milestone */
	records: Record<string, Partial<Record<string, TerrainAchievement[]>>>;
	logbook?: Record<string, { name: string; value: number; last_updated?: string }[]>;
	/** The unit's approvals list, whatever the status asked for */
	submissions?: TerrainSubmission[];
	/** Answers a request before the unit data does, e.g. to fail one */
	override?: (call: Call) => { status?: number; body?: unknown } | Error | undefined;
}

export const leaderProfiles = (
	units: { id: string; name: string; section: string }[] = [
		{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' }
	]
): Profiles => ({
	username: 'SA-1234567',
	profiles: units.map((unit) => ({
		member: { id: 'leader-1', name: 'Sam Leader', roles: [] },
		unit: { id: unit.id, name: unit.name, section: unit.section, roles: ['unit-council'] },
		group: { id: 'group-1', name: '1st Example', roles: ['group-leader'] }
	}))
});

export function member(
	id: string,
	first: string,
	last: string,
	extra: Partial<UnitMember> = {}
): UnitMember {
	return {
		id,
		member_number: `100${id}`,
		first_name: first,
		last_name: last,
		status: 'active',
		date_of_birth: '2013-03-15',
		unit: { id: 'unit-1', section: 'scout', duty: 'member', unit_council: false },
		patrol: { id: 'p1', name: 'Kookaburra', duty: 'member' },
		...extra
	};
}

export function fakeTerrain(unit: FakeUnit) {
	const calls: Call[] = [];
	const writes: Call[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const call: Call = {
			url: String(input),
			method: init?.method ?? 'GET',
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: init?.body as string | undefined
		};
		calls.push(call);
		const respond = (status: number, body: unknown) =>
			new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), {
				status
			});
		const override = unit.override?.(call);
		if (override instanceof Error) throw override;
		if (override) return respond(override.status ?? 200, override.body ?? {});

		const url = new URL(call.url);
		const path = url.pathname;
		if (call.url === COGNITO_ADDRESS) {
			const target = call.headers['X-Amz-Target'];
			if (target.endsWith('GetUser'))
				return respond(200, {
					Username: 'sa-1234567',
					UserAttributes: [{ Name: 'email', Value: 'sam@example.com' }]
				});
			return respond(200, {
				AuthenticationResult: {
					AccessToken: 'a',
					IdToken: 'id',
					RefreshToken: 'r',
					ExpiresIn: 3600
				}
			});
		}
		if (path === '/profiles') return respond(200, unit.profiles);
		if (/^\/units\/[^/]+\/members$/.test(path)) return respond(200, { results: unit.members });
		if (path.endsWith('/assume-profiles') || path.endsWith('/revoke-assumed-profiles'))
			return respond(200, {});
		const logbook = path.match(/^\/members\/([^/]+)\/logbook-metrics$/);
		if (logbook) return respond(200, { results: unit.logbook?.[logbook[1]] ?? [] });
		const memberRecords = path.match(/^\/members\/([^/]+)\/achievements$/);
		if (memberRecords && call.method === 'GET') {
			const type = url.searchParams.get('type') ?? '';
			return respond(200, { results: unit.records[memberRecords[1]]?.[type] ?? [] });
		}
		if (/^\/units\/[^/]+\/submissions$/.test(path))
			return respond(200, { results: unit.submissions ?? [] });
		if (/^\/units\/[^/]+\/achievements$/.test(path)) {
			const stage = Number(url.searchParams.get('stage'));
			const stream = url.searchParams.get('stream');
			const results = Object.values(unit.records)
				.flatMap((r) => r.outdoor_adventure_skill ?? [])
				.filter(
					(r) => r.achievement_meta?.stream === stream && r.achievement_meta?.stage === stage
				);
			return respond(200, { results });
		}
		if (call.method !== 'GET') {
			writes.push(call);
			// As Terrain answers: no content for these, and for a change to an activity
			const noContent =
				/(submit-on-behalf|assessments)$/.test(call.url) ||
				(call.method === 'PATCH' && /\/events\/[^/]+$/.test(path));
			return respond(noContent ? 204 : 200, {});
		}
		return respond(404, 'not found');
	}) as typeof globalThis.fetch;
	return { fetch, calls, writes };
}

/** A Terrain client already logged in to the fake */
export async function signedInTerrain(unit: FakeUnit) {
	const fake = fakeTerrain(unit);
	const terrain = new Terrain({ fetch: fake.fetch });
	await terrain.login('sa', '1234567', 'secret');
	fake.calls.length = 0;
	return { terrain, ...fake };
}
