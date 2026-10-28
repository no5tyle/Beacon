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
	/** Ava's special interest area plan (sub-3) has Kim's approval, and waits for this leader's */
	siaPlan?: boolean;
	/** Units whose approvals Terrain refuses to list, as for a leader not on their Unit Council */
	refuseApprovals?: string[];
	/** Two more awards: Liam's Milestone 1 and Mia's OAS Camping 1 */
	moreAwards?: boolean;
	/** After a vote or award, this many reads of the approvals list still show it as it was, as Terrain can */
	staleReads?: number;
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

// Made-up Cubs, for a Cub unit when a test adds one. Oscar moves up next month, Ella in about half a
// year, and Jack not for a couple of years. Noah is linking across, so he's in the Scout unit too
const cubs = [
	{ name: 'Oscar Lee', months: 10 * 12 + 11, patrol: 'Red Six', duty: 'member', id: '' },
	{ name: 'Ella Park', months: 10 * 12 + 6, patrol: 'Blue Six', duty: 'member', id: '' },
	{ name: 'Jack Wu', months: 9 * 12 + 2, patrol: 'Red Six', duty: 'member', id: '' },
	{ name: 'Noah Jones', months: 11 * 12 + 6, patrol: 'Blue Six', duty: 'member', id: 'unit-1-m3' }
];

// Made-up Joeys, for a Joey unit when a test adds one: Ruby moves up to Cubs next month
const joeys = [
	{ name: 'Ruby Tan', months: 7 * 12 + 11, patrol: '', duty: 'member', id: '' },
	{ name: 'Leo Ford', months: 6 * 12 + 4, patrol: '', duty: 'member', id: '' }
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
	version?: number;
	answers?: Record<string, unknown>;
	uploads?: unknown[];
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
	// Noah has every milestone
	for (const stage of [1, 2, 3]) add(3, 'milestone', 'awarded', { achievement_meta: { stage } });
	// Mia joined the section late, so Milestones 1 and 2 aren't required of her
	for (const stage of [1, 2]) add(2, 'milestone', 'not_required', { achievement_meta: { stage } });
	add(1, 'milestone', 'in_progress', {
		achievement_meta: { stage: 1 },
		event_log: events(['outdoors', 'creative', 'personal_growth'])
	});
	// Liam is logging towards Milestone 2 before Milestone 1 is awarded
	add(1, 'milestone', 'in_progress', {
		achievement_meta: { stage: 2 },
		event_log: [...events(['community', 'community']), ...events(['outdoors'], 'leader')]
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

type Vote = {
	member_id: string;
	member_first_name: string;
	member_last_name: string;
	outcome: string;
	time?: string;
};

/** The unit's approvals list: what's waiting for the Unit Council, and who has voted */
function submissions(unitId: string) {
	const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
	const kim: Vote = {
		member_id: 'leader-2',
		member_first_name: 'Kim',
		member_last_name: 'Leader',
		outcome: 'approved'
	};
	const sam: Vote = { ...kim, member_id: 'leader-1', member_first_name: 'Sam' };
	const item = (
		id: string,
		memberIndex: number,
		achievement: { type: string; achievement_meta?: Record<string, unknown> },
		date: string,
		votes: Vote[] = [],
		write = true
	) => ({
		achievement: { id: `ach-${id}`, ...achievement },
		submission: {
			id,
			type: 'review',
			date,
			status: 'pending',
			outcome: undefined as string | undefined,
			actioned_by: votes
		},
		unit_permissions: { write },
		member: {
			id: `${unitId}-m${memberIndex}`,
			first_name: youth[memberIndex].name.split(' ')[0],
			last_name: youth[memberIndex].name.split(' ')[1]
		}
	});
	const decided = <T extends { submission: { status: string; outcome?: string } }>(
		submission: T,
		outcome: string
	) => {
		submission.submission.status = 'finalised';
		submission.submission.outcome = outcome;
		return submission;
	};
	const awaiting = <T extends { submission: { type: string } }>(submission: T) => {
		submission.submission.type = 'award';
		return submission;
	};
	return [
		item('sub-1', 1, { type: 'milestone', achievement_meta: { stage: 1 } }, days(3), [kim]),
		item(
			'sub-2',
			2,
			{
				type: 'outdoor_adventure_skill',
				achievement_meta: { stream: 'camping', branch: 'camping', stage: 1 }
			},
			days(1)
		),
		item(
			'sub-3',
			0,
			{ type: 'special_interest_area', achievement_meta: { sia_area: 'sia_adventure_sport' } },
			days(20),
			[sam]
		),
		// Terrain doesn't let this leader action it
		item('sub-4', 3, { type: 'intro_section' }, days(0), [], false),
		// Approved by the Unit Council and waiting to be awarded
		awaiting(
			item(
				'sub-5',
				3,
				{
					type: 'outdoor_adventure_skill',
					achievement_meta: { stream: 'bushcraft', branch: 'bushcraft', stage: 1 }
				},
				days(2)
			)
		),
		// Finished with: two recent, and one from long ago
		decided(
			item(
				'old-1',
				0,
				{
					type: 'outdoor_adventure_skill',
					achievement_meta: { stream: 'bushwalking', branch: 'bushwalking', stage: 3 }
				},
				days(14),
				[
					{ ...kim, time: days(12) },
					{ ...sam, time: days(10) }
				]
			),
			'approved'
		),
		decided(
			item('old-2', 1, { type: 'milestone', achievement_meta: { stage: 2 } }, days(30), [
				{ ...kim, outcome: 'feedback', time: days(29) }
			]),
			'feedback'
		),
		decided(
			item('old-3', 2, { type: 'intro_scouting' }, days(400), [
				{ ...kim, time: days(398) },
				{ ...sam, time: days(398) }
			]),
			'approved'
		)
	];
}

export async function fakeTerrain(page: Page, options: FakeOptions = {}): Promise<FakeTerrain> {
	const units = options.units ?? [{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' }];
	const fake: FakeTerrain = { requests: [], writes: [] };
	const store = units.flatMap((unit) => records(unit.id));
	// Each unit's own submission ids; the first unit's are plain, e.g. "sub-2"
	const approvals = units.flatMap((unit, i) =>
		submissions(unit.id).map((a) => {
			if (i > 0) a.submission.id = `${unit.id}-${a.submission.id}`;
			return a;
		})
	);
	// The approvals list as it was before the last vote, while Terrain is slow to show it
	let stale: typeof approvals | null = null;
	let staleReads = 0;
	if (options.moreAwards) {
		const award = approvals.find((a) => a.submission.id === 'sub-5')!;
		const like = (id: string, memberId: string, from: string, first: string, last: string) => {
			const copy = structuredClone(award);
			copy.submission.id = id;
			copy.achievement = structuredClone(
				approvals.find((a) => a.submission.id === from)!.achievement
			);
			copy.member = { id: memberId, first_name: first, last_name: last };
			approvals.push(copy);
		};
		like('sub-6', `${units[0].id}-m1`, 'sub-1', 'Liam', 'Smith');
		like('sub-7', `${units[0].id}-m2`, 'sub-2', 'Mia', 'Brown');
	}
	if (options.siaPlan) {
		const plan = approvals.find((a) => a.submission.id === 'sub-3')!;
		plan.submission.actioned_by = [
			{
				member_id: 'leader-2',
				member_first_name: 'Kim',
				member_last_name: 'Leader',
				outcome: 'approved'
			}
		];
		store.push({
			id: plan.achievement.id,
			member_id: plan.member.id,
			type: 'special_interest_area',
			status: 'draft_review',
			section: 'scout',
			status_updated: new Date().toISOString(),
			template: 'sia/scout/plan',
			version: 2,
			last_updated: new Date().toISOString(),
			answers: {
				attach_documentation: [],
				project_name: 'Bracelet making business',
				special_interest_area_selection: 'sia_adventure_sport'
			},
			uploads: []
		});
	}
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
		if (unitMembers) {
			const section = units.find((u) => u.id === unitMembers[1])?.section ?? 'scout';
			const list =
				section === 'cub'
					? cubs
					: section === 'joey'
						? joeys
						: youth.map((y) => ({ ...y, id: '' }));
			return json(route, {
				results: list.map((member, i) => ({
					id: member.id || `${unitMembers[1]}-m${i}`,
					member_number: `10${i}`,
					first_name: member.name.split(' ')[0],
					last_name: member.name.split(' ')[1],
					status: 'active',
					date_of_birth: isoDate(member.months, 10),
					unit: { id: unitMembers[1], section, duty: 'member', unit_council: i === 0 },
					patrol: { id: member.patrol, name: member.patrol, duty: member.duty }
				}))
			});
		}
		if (
			url.pathname.endsWith('assume-profiles') ||
			url.pathname.endsWith('revoke-assumed-profiles')
		)
			return json(route, {});

		if (request.method() !== 'GET') {
			const body = request.postDataJSON() as Record<string, unknown>;
			fake.writes.push({ request: `${request.method()} ${name}`, body });
			// A Unit Council vote: two approvals and Terrain finalises it
			const assessed = url.pathname.match(/^\/submissions\/([^/]+)\/assessments$/);
			if (assessed && options.staleReads) {
				stale = structuredClone(approvals);
				staleReads = options.staleReads;
			}
			if (assessed) {
				const approval = approvals.find((a) => a.submission.id === assessed[1]);
				if (!approval || !approval.unit_permissions.write) return json(route, {}, 403);
				// Awarding finalises it straight away
				if (body.outcome === 'awarded') {
					if (approval.submission.type !== 'award') return json(route, {}, 400);
					approval.submission.status = 'finalised';
					approval.submission.outcome = 'awarded';
					return json(route, {}, 204);
				}
				approval.submission.actioned_by.push({
					member_id: 'leader-1',
					member_first_name: 'Sam',
					member_last_name: 'Leader',
					outcome: String(body.outcome),
					time: new Date().toISOString()
				});
				if (approval.submission.actioned_by.filter((v) => v.outcome === 'approved').length >= 2) {
					approval.submission.status = 'finalised';
					approval.submission.outcome = 'approved';
				}
				return json(route, {}, 204);
			}
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
			// An activity added to the unit's programme
			if (url.hostname.startsWith('events') && /^\/units\/[^/]+\/events$/.test(url.pathname))
				return json(route, { id: 'event-1', ...body });
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

		const unitSubmissions = url.pathname.match(/^\/units\/([^/]+)\/submissions$/);
		const listed = () => (stale && staleReads-- > 0 ? stale : approvals);
		if (unitSubmissions && options.refuseApprovals?.includes(unitSubmissions[1]))
			return json(route, { message: 'Forbidden' }, 403);
		if (unitSubmissions)
			return json(route, {
				results: listed().filter(
					(a) =>
						a.member.id.startsWith(unitSubmissions[1]) &&
						a.submission.status === url.searchParams.get('status')
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
	await page.waitForURL((url) => (url.pathname + url.search).endsWith(`/${path}`));
}
