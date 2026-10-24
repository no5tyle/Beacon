// A fake Terrain for page tests: a made-up group and unit with made-up youth, answering the requests Beacon makes.
// Changes Beacon saves are kept, so a page shows them when it reloads
import type { Page, Route } from '@playwright/test';

export interface FakeOptions {
	/** Units the leader has; defaults to one Scout unit */
	units?: { id: string; name: string; section: string }[];
	/** Refuse the login with this message */
	refuseLogin?: string;
	/** Log in as a youth member rather than a leader */
	youth?: boolean;
}

export interface FakeTerrain {
	requests: string[];
	/** Changes Beacon sent, e.g. "POST achievements/members/unit-1-m0/achievements" with its body */
	writes: { request: string; body: unknown }[];
}

// Made-up youth. Ava moves up to Venturers soon; dates of birth are worked out from today so that stays true
const youth = [
	{ name: 'Ava Nguyen', months: 14 * 12 + 10, patrol: 'Kookaburra', duty: 'patrol_leader' },
	{ name: 'Liam Smith', months: 13 * 12 + 4, patrol: 'Kookaburra', duty: 'member' },
	{ name: 'Mia Brown', months: 12 * 12 + 8, patrol: 'Wombat', duty: 'assistant_patrol_leader' },
	{ name: 'Noah Jones', months: 11 * 12 + 6, patrol: 'Wombat', duty: 'member' }
];

const STREAMS: Record<string, string> = {
	bushcraft: 'Bushcraft',
	bushwalking: 'Bushwalking',
	camping: 'Camping',
	alpine: 'Alpine',
	cycling: 'Cycling',
	vertical: 'Vertical',
	aquatics: 'Aquatics',
	boating: 'Boating',
	paddling: 'Paddling'
};

const isoDate = (monthsAgo: number, day = 15) => {
	const date = new Date();
	date.setDate(1);
	date.setMonth(date.getMonth() - monthsAgo);
	date.setDate(day);
	return date.toISOString().slice(0, 10);
};

/** A made-up stage template: plan, do and review statements, and the logbook check */
export function template(stream: string, stage: number) {
	const title = STREAMS[stream] ?? stream;
	const id = (name: string) => `${stream}_${stage}_${name}`;
	const checkbox = (name: string, label: string, detail = '') => ({
		id: id(name),
		type: 'verifiable_checkbox',
		label,
		dialog_text: detail
	});
	return {
		template: `oas/${stream}/${stage}`,
		meta: { stage, stream },
		version: 1,
		document: [
			{
				title: `Stage ${stage} - ${title}`,
				input_groups: [
					{
						title: 'Plan>',
						inputs: [
							checkbox('menu', `I can help plan a menu for a ${title.toLowerCase()} activity.`),
							checkbox('gear', `I can pack the gear I need for a ${title.toLowerCase()} activity.`)
						]
					},
					{
						title: 'Do>',
						inputs: [
							checkbox(
								'map',
								'I can use a map and compass to find my way.',
								'Show the youth can orient the map and take a bearing.'
							),
							checkbox('first_aid', 'I can treat a blister and a minor cut with first aid.'),
							checkbox('knots', 'I can tie a reef knot and a clove hitch.')
						]
					},
					{
						title: 'Review>',
						inputs: [
							checkbox('review', 'I can talk about what went well and what I would change.'),
							{ id: 'logbook_up_to_date', type: 'checkbox', label: 'My logbook is up to date.' }
						]
					}
				]
			}
		]
	};
}

interface Fixture {
	id: string;
	member_id: string;
	type: string;
	status: string;
	section: string;
	status_updated: string;
	last_updated?: string;
	achievement_meta?: { stream?: string; stage?: number; branch?: string };
	template?: string;
	answers?: Record<string, unknown>;
	event_log?: unknown[];
	imported?: unknown;
}

/** Each youth's records: OAS stages, milestones, introductions, SIA projects and peak award parts */
function records(unitId: string): Fixture[] {
	const list: Fixture[] = [];
	let n = 0;
	const add = (memberIndex: number, type: string, status: string, extra: Partial<Fixture> = {}) =>
		list.push({
			id: `rec-${n++}`,
			member_id: `${unitId}-m${memberIndex}`,
			type,
			status,
			section: 'scout',
			status_updated: `${isoDate(3 + (n % 9))}T10:00:00+10:00`,
			last_updated: `${isoDate(1)}T10:00:00+10:00`,
			...extra
		});
	const oas = (memberIndex: number, stream: string, stage: number, status: string, done = 0) => {
		const answers: Record<string, unknown> = {};
		for (const input of template(stream, stage)
			.document[0].input_groups.flatMap((g) => g.inputs)
			.slice(0, ['in_progress', 'draft_review'].includes(status) ? done : 7)) {
			answers[input.id] = true;
			if (input.type === 'verifiable_checkbox') {
				answers[`${input.id}_verifierName`] = 'Sam Leader';
				answers[`${input.id}_verifiedDate`] = '01/09/2026';
			}
		}
		add(memberIndex, 'outdoor_adventure_skill', status, {
			achievement_meta: { stream, stage, branch: stream },
			template: `oas/${stream}/${stage}`,
			answers
		});
	};
	// Ava
	oas(0, 'bushwalking', 1, 'awarded');
	oas(0, 'bushwalking', 2, 'awarded');
	oas(0, 'bushwalking', 3, 'awarded');
	oas(0, 'bushwalking', 4, 'draft_review', 4);
	oas(0, 'camping', 1, 'awarded');
	oas(0, 'camping', 2, 'awarded');
	oas(0, 'camping', 3, 'awarded');
	oas(0, 'bushcraft', 1, 'awarded');
	oas(0, 'bushcraft', 2, 'awarded');
	oas(0, 'cycling', 1, 'awarded');
	// Liam
	oas(1, 'bushwalking', 1, 'awarded');
	oas(1, 'bushwalking', 2, 'awarded');
	oas(1, 'camping', 1, 'awarded');
	oas(1, 'camping', 2, 'in_progress', 2);
	oas(1, 'bushcraft', 1, 'awarded');
	// Mia
	oas(2, 'bushwalking', 1, 'awarded');
	oas(2, 'camping', 1, 'awarded');
	oas(2, 'bushcraft', 1, 'in_progress', 3);
	// Like older Joey records ticked through events, this one has no last_updated
	delete list[list.length - 1].last_updated;

	const events = (areas: string[], credit = 'participant') =>
		areas.map((area, i) => ({
			credit_type: credit,
			challenge_area: area,
			event_name: `${{ community: 'Clean up day', outdoors: 'Night hike', creative: 'Billy cart build', personal_growth: 'Cooking night' }[area]} ${i + 1}`,
			event_start_datetime: `${isoDate(10 - i)}T19:00:00+10:00`
		}));
	for (let m = 0; m < youth.length; m++) {
		add(m, 'intro_scouting', 'awarded', {
			section: 'joey',
			status_updated: `${isoDate(40)}T10:00:00+10:00`
		});
		add(m, 'intro_section', 'awarded', { status_updated: `${isoDate(20)}T10:00:00+10:00` });
	}
	add(0, 'milestone', 'awarded', { achievement_meta: { stage: 1 } });
	add(0, 'milestone', 'in_progress', {
		achievement_meta: { stage: 2 },
		event_log: [
			...events(['community', 'community', 'outdoors', 'outdoors', 'outdoors', 'creative']),
			...events(['personal_growth', 'creative'], 'leader')
		]
	});
	add(1, 'milestone', 'in_progress', {
		achievement_meta: { stage: 1 },
		event_log: events(['outdoors', 'creative', 'personal_growth'])
	});
	add(0, 'special_interest_area', 'awarded', {
		answers: {
			special_interest_area_selection: 'sia_adventure_sport',
			project_name: 'Rock climbing day'
		}
	});
	add(0, 'special_interest_area', 'in_progress', {
		answers: { special_interest_area_selection: 'sia_environment', project_name: 'Creek clean up' }
	});
	add(0, 'course_reflection', 'awarded');
	return list;
}

export async function fakeTerrain(page: Page, options: FakeOptions = {}): Promise<FakeTerrain> {
	const units = options.units ?? [{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' }];
	const fake: FakeTerrain = { requests: [], writes: [] };
	const store = units.flatMap((unit) => records(unit.id));
	const json = (route: Route, body: unknown, status = 200) =>
		route.fulfill({
			status,
			contentType: 'application/json',
			headers: {
				'access-control-allow-origin': '*',
				'access-control-allow-headers': '*',
				'access-control-allow-methods': '*'
			},
			body: status === 204 ? '' : JSON.stringify(body)
		});

	await page.route(/terrain\.scouts\.com\.au|cognito-idp/, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const name = `${url.hostname.split('.')[0]}${url.pathname}`;
		fake.requests.push(`${request.method()} ${name}${url.search}`);
		if (request.method() === 'OPTIONS') return json(route, {});
		if (url.hostname.startsWith('cognito-idp')) {
			const target = request.headers()['x-amz-target'] ?? '';
			if (target.endsWith('GetUser'))
				return json(route, {
					Username: 'sa-1234567',
					UserAttributes: [{ Name: 'email', Value: 'sam@example.com' }]
				});
			if (options.refuseLogin)
				return json(route, { __type: 'NotAuthorizedException', message: options.refuseLogin }, 400);
			return json(route, {
				AuthenticationResult: { AccessToken: 'a', IdToken: 'i', RefreshToken: 'r', ExpiresIn: 3600 }
			});
		}
		if (url.pathname === '/profiles')
			return json(route, {
				username: 'SA-1234567',
				profiles: units.map((unit) => ({
					member: {
						id: options.youth ? 'unit-1-m0' : 'leader-1',
						name: options.youth ? 'Ava Nguyen' : 'Sam Leader'
					},
					unit: { ...unit, roles: options.youth ? [] : ['unit-council'] },
					group: {
						id: 'group-1',
						name: '1st Example',
						roles: options.youth ? [] : ['group-leader']
					}
				}))
			});
		const unitMembers = url.pathname.match(/^\/units\/([^/]+)\/members$/);
		if (unitMembers)
			return json(route, {
				results: youth.map((member, i) => ({
					id: `${unitMembers[1]}-m${i}`,
					member_number: `10${i}`,
					first_name: member.name.split(' ')[0],
					last_name: member.name.split(' ')[1],
					status: 'active',
					date_of_birth: isoDate(member.months, 10),
					unit: { id: unitMembers[1], section: 'scout', duty: 'member', unit_council: i === 0 },
					patrol: { id: member.patrol, name: member.patrol, duty: member.duty }
				}))
			});
		if (
			url.pathname.endsWith('assume-profiles') ||
			url.pathname.endsWith('revoke-assumed-profiles')
		)
			return json(route, {});

		if (request.method() !== 'GET') {
			const body = request.postDataJSON() as Record<string, unknown>;
			fake.writes.push({ request: `${request.method()} ${name}`, body });
			const created = url.pathname.match(/^\/members\/([^/]+)\/achievements$/);
			if (created) {
				store.push({
					...(body as unknown as Fixture),
					id: `rec-new-${store.length}`,
					member_id: created[1],
					type: 'outdoor_adventure_skill',
					status: 'in_progress',
					status_updated: new Date().toISOString(),
					last_updated: new Date().toISOString()
				});
				return json(route, {});
			}
			const existing = url.pathname.match(
				/^\/members\/[^/]+\/achievements\/([^/]+)(\/submit-on-behalf)?$/
			);
			const record = store.find((r) => r.id === existing?.[1]);
			if (record && existing?.[2]) {
				record.status = 'pending_review';
				return json(route, {}, 204);
			}
			if (record) {
				record.answers = body.answers as Record<string, unknown>;
				record.last_updated = new Date().toISOString();
				return json(route, {});
			}
			return json(route, {}, 404);
		}

		const memberRecords = url.pathname.match(/^\/members\/([^/]+)\/achievements$/);
		if (memberRecords)
			return json(route, {
				results: store.filter(
					(r) => r.member_id === memberRecords[1] && r.type === url.searchParams.get('type')
				)
			});
		const logbook = url.pathname.match(/^\/members\/([^/]+)\/logbook-metrics$/);
		if (logbook)
			return json(route, {
				results: logbook[1].endsWith('m0')
					? [
							{ name: 'total_distance_hiked', value: 42000, last_updated: isoDate(1) },
							{ name: 'total_nights_camped', value: 9, last_updated: isoDate(1) }
						]
					: []
			});
		if (/^\/units\/[^/]+\/achievements$/.test(url.pathname))
			return json(route, {
				results: store.filter(
					(r) =>
						r.member_id.startsWith(url.pathname.split('/')[2]) &&
						r.type === 'outdoor_adventure_skill' &&
						r.achievement_meta?.stream === url.searchParams.get('stream') &&
						r.achievement_meta?.stage === Number(url.searchParams.get('stage'))
				)
			});

		const tree = url.pathname.match(/^\/oas\/([^/]+)\/tree\.json$/);
		if (tree) {
			const stream = tree[1];
			const node = (stage: number): Record<string, unknown> => ({
				branch_id: stream,
				title: STREAMS[stream] ?? stream,
				stage,
				template_link: `oas/${stream}/${stage}/latest.json`,
				children: stage < 9 ? [node(stage + 1)] : []
			});
			return json(route, { title: STREAMS[stream] ?? stream, stream_id: stream, tree: node(1) });
		}
		const stageTemplate = url.pathname.match(/^\/oas\/([^/]+)\/(\d)\/latest\.json$/);
		if (stageTemplate) return json(route, template(stageTemplate[1], Number(stageTemplate[2])));
		return json(route, {}, 404);
	});
	return fake;
}

/** Logs in through the login page, typing as a person would */
export async function logIn(page: Page, branch = 'sa'): Promise<void> {
	await page.goto('login/');
	await page.selectOption('#branch', branch);
	await page.locator('#memberNumber').pressSequentially('1234567');
	await page.locator('#password').pressSequentially('secret');
	await page.click('#logIn');
	await page.waitForURL((url) => !url.pathname.endsWith('/login/'));
}

/** Moves to a page within Beacon, as a link would. A full page load would sign the leader out */
export async function navigate(page: Page, path: string): Promise<void> {
	await page.evaluate((path) => {
		// Beacon's own Home link holds the address it is served from
		const home = document.querySelector('a.brand')?.getAttribute('href') ?? '/';
		const link = document.createElement('a');
		link.href = home + path;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}, path);
	await page.waitForURL((url) => url.pathname.endsWith(`/${path}`));
}
