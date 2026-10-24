// The Terrain client against a fake Terrain that records every request
import { describe, expect, it } from 'vitest';
import {
	ACHIEVEMENTS_ADDRESS,
	CLIENT_IDS,
	COGNITO_ADDRESS,
	isLeader,
	MEMBERS_ADDRESS,
	Terrain,
	TEMPLATES_ADDRESS,
	type RequestLogEntry
} from '#lib/terrain/client.js';
import { SessionExpiredError, TerrainError } from '#lib/terrain/errors.js';
import { ProfileGate } from '#lib/terrain/profileGate.js';
import { readJson } from './fixtures.js';

interface Call {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

type Answer =
	{ status?: number; body?: unknown } | Error | Promise<{ status?: number; body?: unknown }>;

/** A fake Terrain: answers each request with the first route that matches, and records it */
function fakeTerrain(route: (call: Call) => Answer | undefined) {
	const calls: Call[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const call: Call = {
			url: String(input),
			method: init?.method ?? 'GET',
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: init?.body as string | undefined
		};
		calls.push(call);
		const answer = await (route(call) ?? { status: 404, body: '' });
		if (answer instanceof Error) throw answer;
		const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {});
		return new Response(answer.status === 204 ? null : body, { status: answer.status ?? 200 });
	}) as typeof globalThis.fetch;
	return { fetch, calls };
}

const tokens = (id = 'id-1', expiresIn = 3600) => ({
	AuthenticationResult: {
		AccessToken: `access-${id}`,
		IdToken: id,
		RefreshToken: 'refresh-1',
		ExpiresIn: expiresIn,
		TokenType: 'Bearer'
	}
});

const isCognito = (call: Call, action: string) =>
	call.url === COGNITO_ADDRESS &&
	call.headers['X-Amz-Target'] === `AWSCognitoIdentityProviderService.${action}`;

/** A client already logged in as a leader, with tokens that are still fresh */
async function signedIn(
	route: (call: Call) => Answer | undefined,
	options: { now?: () => number; gate?: ProfileGate } = {}
) {
	let loggedIn = false;
	const fake = fakeTerrain((call) => (loggedIn ? route(call) : { body: tokens() }));
	const terrain = new Terrain({ fetch: fake.fetch, ...options });
	await terrain.login('sa', '1234567', 'secret');
	loggedIn = true;
	fake.calls.length = 0;
	return { terrain, calls: fake.calls };
}

/** Lets pending promises run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('logging in', () => {
	it('tries each of Terrain’s login apps until one accepts, sending what the Blazor app sent', async () => {
		const fake = fakeTerrain((call) => {
			const body = JSON.parse(call.body!);
			return body.ClientId === CLIENT_IDS[2]
				? { body: tokens() }
				: {
						status: 400,
						body: {
							__type: 'ResourceNotFoundException',
							message: 'User pool client does not exist.'
						}
					};
		});
		const terrain = new Terrain({ fetch: fake.fetch, now: () => 1_000_000 });

		const result = await terrain.login('sa', '1234567', 'secret');

		expect(result.ok).toBe(true);
		expect(fake.calls.length).toBe(3);
		const first = fake.calls[0];
		expect(first.url).toBe(COGNITO_ADDRESS);
		expect(first.method).toBe('POST');
		expect(first.headers['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.InitiateAuth');
		expect(first.headers['Content-Type']).toBe('application/x-amz-json-1.1');
		expect(first.headers.authorization).toBeUndefined();
		expect(first.body).toBe(
			`{"AuthFlow":"USER_PASSWORD_AUTH","ClientId":"${CLIENT_IDS[0]}","AuthParameters":{"USERNAME":"sa-1234567","PASSWORD":"secret","DEVICE_KEY":null,"REFRESH_TOKEN":null},"ClientMetadata":{}}`
		);
		expect(terrain.session).toMatchObject({
			clientId: CLIENT_IDS[2],
			idToken: 'id-1',
			refreshToken: 'refresh-1',
			isYouth: false
		});
		expect(terrain.session!.expiresAt, 'renewed a minute before the tokens expire').toBe(
			1_000_000 + 3540 * 1000
		);
	});

	it('reports why a login was refused', async () => {
		const fake = fakeTerrain(() => ({
			status: 400,
			body: { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' }
		}));
		const terrain = new Terrain({ fetch: fake.fetch });

		const result = await terrain.login('sa', '1234567', 'wrong');

		expect(result).toEqual({
			ok: false,
			errorType: 'NotAuthorizedException',
			message: 'Incorrect username or password.'
		});
		expect(fake.calls.length).toBe(CLIENT_IDS.length);
		expect(terrain.isSignedIn).toBe(false);
	});

	it('says when Terrain can’t be reached', async () => {
		const terrain = new Terrain({ fetch: fakeTerrain(() => new TypeError('Load failed')).fetch });

		await expect(terrain.login('sa', '1', 'x')).rejects.toThrow(
			'Terrain turned the request away without saying why, or there was no signal.'
		);
	});

	it('gets the member’s details with the access token', async () => {
		const { terrain, calls } = await signedIn((call) =>
			isCognito(call, 'GetUser')
				? {
						body: {
							Username: 'sa-1234567',
							UserAttributes: [{ Name: 'email', Value: 'sam@example.com' }]
						}
					}
				: undefined
		);

		const user = await terrain.user();

		expect(user.UserAttributes![0].Value).toBe('sam@example.com');
		expect(calls[0].body).toBe('{"AccessToken":"access-id-1"}');
	});

	it('logs login requests without their bodies, which hold tokens', async () => {
		const log: RequestLogEntry[] = [];
		const fake = fakeTerrain(() => ({ body: tokens() }));
		await new Terrain({ fetch: fake.fetch, log: (entry) => log.push(entry) }).login(
			'sa',
			'1',
			'secret'
		);

		expect(log.length).toBe(1);
		expect(log[0].body).toBeUndefined();
		expect(JSON.stringify(log)).not.toContain('secret');
		expect(JSON.stringify(log)).not.toContain('id-1');
	});

	it('works out whether the member is a leader from their roles', () => {
		const profile = (groupRoles: string[], unitRoles: string[]) => ({
			member: { id: 'm', name: 'M' },
			group: { id: 'g', name: 'G', roles: groupRoles },
			unit: { id: 'u', name: 'U', roles: unitRoles }
		});
		const of = (...profiles: ReturnType<typeof profile>[]) => ({ username: 'x', profiles });

		expect(isLeader(of(profile(['group-leader'], [])))).toBe(true);
		expect(isLeader(of(profile(['support-leader-group-1'], [])))).toBe(true);
		expect(isLeader(of(profile([], ['unit-council'])))).toBe(true);
		expect(isLeader(of(profile([], ['member'])))).toBe(false);
		expect(isLeader(of())).toBe(false);
	});
});

describe('reading from Terrain', () => {
	it('sends the ID token as Terrain’s own app does, and returns the results', async () => {
		const { terrain, calls } = await signedIn((call) =>
			call.url === `${MEMBERS_ADDRESS}units/unit-1/members`
				? { body: { results: [{ id: 'm1' }], total: 1 } }
				: undefined
		);

		const members = await terrain.unitMembers('unit-1');

		expect(members.map((m) => m.id)).toEqual(['m1']);
		expect(calls[0].method).toBe('GET');
		expect(calls[0].headers.authorization).toBe('id-1');
		expect(calls[0].headers.accept).toBe('application/json, text/plain, */*');
	});

	it('asks for each kind of record at the same addresses as the Blazor app', async () => {
		const { terrain, calls } = await signedIn(() => ({ body: { results: [] } }));

		await terrain.profiles();
		await terrain.unitOASAchievements('unit-1', 'bushwalking', 'bushwalking', 3);
		await terrain.memberAchievements('m1', 'milestone');
		await terrain.memberAchievements('m1', 'outdoor_adventure_skill');
		await terrain.logbookMetrics('m1');
		await terrain.oasTree('alpine');
		await terrain.oasTemplate('oas/alpine/snowboarding/5/latest.json');
		await terrain.oasTemplate('oas/bushwalking/3');

		expect(calls.map((c) => c.url)).toEqual([
			`${MEMBERS_ADDRESS}profiles`,
			`${ACHIEVEMENTS_ADDRESS}units/unit-1/achievements?type=outdoor_adventure_skill&stream=bushwalking&branch=bushwalking&stage=3`,
			`${ACHIEVEMENTS_ADDRESS}members/m1/achievements?type=milestone`,
			`${ACHIEVEMENTS_ADDRESS}members/m1/achievements?type=outdoor_adventure_skill`,
			`${ACHIEVEMENTS_ADDRESS}members/m1/logbook-metrics`,
			`${TEMPLATES_ADDRESS}oas/alpine/tree.json`,
			`${TEMPLATES_ADDRESS}oas/alpine/snowboarding/5/latest.json`,
			`${TEMPLATES_ADDRESS}oas/bushwalking/3/latest.json`
		]);
	});

	it('reads OAS templates signed out, for the Reference', async () => {
		const fake = fakeTerrain(() => ({ body: { title: 'Alpine' } }));
		const terrain = new Terrain({ fetch: fake.fetch });

		await terrain.oasTree('alpine');

		expect(fake.calls[0].headers.authorization).toBeUndefined();
	});

	it('throws a TerrainError for an error response or no signal', async () => {
		const { terrain } = await signedIn((call) =>
			call.url.endsWith('/profiles')
				? { status: 500, body: 'oops' }
				: new TypeError('Failed to fetch')
		);

		await expect(terrain.profiles()).rejects.toMatchObject({ status: 500, name: 'TerrainError' });
		const error = await terrain.unitMembers('u').catch((e) => e);
		expect(error).toBeInstanceOf(TerrainError);
		expect(error.message).toBe(
			'Terrain turned the request away without saying why, or there was no signal.'
		);
	});

	it('needs a login for everything but the templates', async () => {
		const terrain = new Terrain({ fetch: fakeTerrain(() => ({ body: {} })).fetch });

		await expect(terrain.profiles()).rejects.toBeInstanceOf(SessionExpiredError);
	});
});

describe('renewing the login', () => {
	it('renews expired tokens once, however many requests are waiting', async () => {
		let time = 0;
		let refreshes = 0;
		const { terrain, calls } = await signedIn(
			(call) => {
				if (isCognito(call, 'InitiateAuth')) {
					refreshes++;
					return { body: tokens('id-2') };
				}
				return { body: { results: [] } };
			},
			{ now: () => time }
		);
		time = 3600 * 1000;

		await Promise.all([
			terrain.profiles(),
			terrain.unitMembers('u'),
			terrain.memberAchievements('m', 'milestone')
		]);

		expect(refreshes).toBe(1);
		const refresh = calls.find((c) => isCognito(c, 'InitiateAuth'))!;
		expect(refresh.body).toBe(
			`{"AuthFlow":"REFRESH_TOKEN_AUTH","ClientId":"${CLIENT_IDS[0]}","AuthParameters":{"USERNAME":null,"PASSWORD":null,"DEVICE_KEY":null,"REFRESH_TOKEN":"refresh-1"},"ClientMetadata":{}}`
		);
		expect(
			calls
				.filter((c) => c.url !== COGNITO_ADDRESS)
				.every((c) => c.headers.authorization === 'id-2')
		).toBe(true);
	});

	it('signs out when Terrain won’t renew the login', async () => {
		let time = 0;
		const { terrain } = await signedIn(
			(call) =>
				isCognito(call, 'InitiateAuth')
					? { status: 400, body: { __type: 'NotAuthorizedException' } }
					: { body: {} },
			{ now: () => time }
		);
		time = 3600 * 1000;

		await expect(terrain.profiles()).rejects.toBeInstanceOf(SessionExpiredError);
		expect(terrain.isSignedIn).toBe(false);
	});
});

describe('changing records in Terrain', () => {
	const ok = (status: number) => () => ({ status, body: status === 204 ? '' : '{}' });

	it('saves records as JSON, succeeding only on the status Terrain’s app expects', async () => {
		const { terrain, calls } = await signedIn(ok(200));
		const body = { achievement_type: 'outdoor_adventure_skill', answers: { a: true } };

		const created = await terrain.createAchievement('m1', body);
		const updated = await terrain.updateAchievement('m1', 'ach-1', body);

		expect(created.success).toBe(true);
		expect(updated.success).toBe(true);
		expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
			`POST ${ACHIEVEMENTS_ADDRESS}members/m1/achievements`,
			`PUT ${ACHIEVEMENTS_ADDRESS}members/m1/achievements/ach-1`
		]);
		expect(calls[1].body).toBe(JSON.stringify(body));
		expect(calls[1].headers['Content-Type']).toBe('application/json');
		expect(calls[1].headers.authorization).toBe('id-1');

		const { terrain: other } = await signedIn(ok(201));
		expect((await other.createAchievement('m1', body)).success, 'Only 200 counts for a save').toBe(
			false
		);
	});

	it('sends the Blazor app’s request bodies unchanged', async () => {
		const golden = readJson<{ expected: Record<string, object> }>('../golden/oas-recording.json');
		const { terrain, calls } = await signedIn(ok(200));

		await terrain.updateAchievement('m1', 'ach-2', golden.expected.joeyUpdateBody);
		await terrain.createAchievement('m1', golden.expected.createBody);

		expect(calls[0].body).toBe(JSON.stringify(golden.expected.joeyUpdateBody));
		expect(JSON.parse(calls[0].body!)).not.toHaveProperty('last_updated');
		expect(calls[1].body).toBe(JSON.stringify(golden.expected.createBody));
	});

	it('submits for review on behalf, succeeding only on 204', async () => {
		const { terrain, calls } = await signedIn(ok(204));

		const result = await terrain.submitOnBehalf('m1', 'ach-1', { type: 'review' });

		expect(result).toEqual({ success: true, status: 204, body: '' });
		expect(calls[0].url).toBe(
			`${ACHIEVEMENTS_ADDRESS}members/m1/achievements/ach-1/submit-on-behalf`
		);
		const { terrain: other } = await signedIn(ok(200));
		expect((await other.submitOnBehalf('m1', 'ach-1', {})).success).toBe(false);
	});

	it('reports a refused save without throwing', async () => {
		const { terrain } = await signedIn(() => new TypeError('Load failed'));

		const result = await terrain.updateAchievement('m1', 'ach-1', {});

		expect(result).toEqual({
			success: false,
			status: 0,
			body: 'Terrain turned the request away without saying why, or there was no signal.'
		});
	});
});

describe('acting as a youth', () => {
	it('switches to the youth, runs the span, and switches back', async () => {
		const { terrain, calls } = await signedIn(() => ({ body: { results: [] } }));

		const result = await terrain.actAsYouth('m1', async (youth) => {
			await youth.memberAchievements('m1', 'outdoor_adventure_skill');
			return 'done';
		});

		expect(result).toEqual({ acted: true, value: 'done' });
		expect(calls.map((c) => `${c.method} ${c.url.replace(/\?.*/, '')}`)).toEqual([
			`POST ${MEMBERS_ADDRESS}revoke-assumed-profiles`,
			`POST ${MEMBERS_ADDRESS}members/m1/assume-profiles`,
			`GET ${ACHIEVEMENTS_ADDRESS}members/m1/achievements`,
			`POST ${MEMBERS_ADDRESS}revoke-assumed-profiles`
		]);
	});

	it('doesn’t run the span when Terrain won’t switch, and still switches back', async () => {
		const { terrain, calls } = await signedIn((call) =>
			call.url.endsWith('/assume-profiles') ? { status: 403, body: 'no' } : { body: {} }
		);
		let ran = false;

		const result = await terrain.actAsYouth('m1', async () => {
			ran = true;
		});

		expect(ran).toBe(false);
		expect(result).toEqual({ acted: false, result: { success: false, status: 403, body: 'no' } });
		expect(calls.at(-1)!.url).toBe(`${MEMBERS_ADDRESS}revoke-assumed-profiles`);
	});

	it('switches back even if the span fails', async () => {
		const { terrain, calls } = await signedIn(() => ({ body: {} }));

		await expect(
			terrain.actAsYouth('m1', async () => {
				throw new Error('broke');
			})
		).rejects.toThrow('broke');
		expect(calls.at(-1)!.url).toBe(`${MEMBERS_ADDRESS}revoke-assumed-profiles`);
	});

	it('doesn’t switch profiles for a youth member, who acts as themselves', async () => {
		const { terrain, calls } = await signedIn(() => ({ body: {} }));
		terrain.setYouth(true);

		const result = await terrain.actAsYouth('m1', async () => 'mine');

		expect(result).toEqual({ acted: true, value: 'mine' });
		expect(calls.some((c) => c.url.endsWith('/assume-profiles'))).toBe(false);
	});

	it('waits for requests already under way, and holds new ones back until it is done', async () => {
		const order: string[] = [];
		let finishBackground!: () => void;
		const background = new Promise<{ body: unknown }>(
			(resolve) => (finishBackground = () => resolve({ body: { results: [] } }))
		);
		const { terrain } = await signedIn((call) => {
			const what = call.url.includes('m-background')
				? 'background'
				: call.url.includes('m-later')
					? 'later'
					: call.url.replace(/.*\//, '').replace(/\?.*/, '');
			order.push(`start ${what}`);
			return what === 'background'
				? background.then((a) => (order.push('end background'), a))
				: { body: { results: [] } };
		});

		const backgroundLoad = terrain.memberAchievements('m-background', 'milestone');
		await settle();
		const span = terrain.actAsYouth('m1', async (youth) => {
			order.push('span runs');
			await youth.memberAchievements('m1', 'outdoor_adventure_skill');
		});
		await settle();
		const later = terrain.memberAchievements('m-later', 'milestone');
		await settle();
		expect(order, 'the span waits for the background load').toEqual(['start background']);

		finishBackground();
		await Promise.all([backgroundLoad, span, later]);

		expect(order).toEqual([
			'start background',
			'end background',
			'start revoke-assumed-profiles',
			'start assume-profiles',
			'span runs',
			'start achievements',
			'start revoke-assumed-profiles',
			'start later'
		]);
	});

	it('runs one youth at a time', async () => {
		const gate = new ProfileGate();
		const order: string[] = [];
		const { terrain } = await signedIn(
			(call) => {
				const member = call.url.match(/members\/(m\d)\/assume/)?.[1];
				if (member) order.push(`assume ${member}`);
				return { body: {} };
			},
			{ gate }
		);

		await Promise.all(
			['m1', 'm2', 'm3'].map((id) =>
				terrain.actAsYouth(id, async () => {
					order.push(`span ${id}`);
					await settle();
					order.push(`end ${id}`);
				})
			)
		);

		expect(order).toEqual([
			'assume m1',
			'span m1',
			'end m1',
			'assume m2',
			'span m2',
			'end m2',
			'assume m3',
			'span m3',
			'end m3'
		]);
		expect(gate.actingAsYouth).toBe(false);
	});
});
