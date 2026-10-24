// A fake Terrain for page tests: a made-up group with a Scout and a Cub unit, answering the requests Beacon makes
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
}

const youth = ['Ava Nguyen', 'Liam Smith', 'Mia Brown', 'Noah Jones'];

export async function fakeTerrain(page: Page, options: FakeOptions = {}): Promise<FakeTerrain> {
	const units = options.units ?? [{ id: 'unit-1', name: 'Mt Example Scouts', section: 'scout' }];
	const fake: FakeTerrain = { requests: [] };
	const json = (route: Route, body: unknown, status = 200) =>
		route.fulfill({
			status,
			contentType: 'application/json',
			headers: {
				'access-control-allow-origin': '*',
				'access-control-allow-headers': '*',
				'access-control-allow-methods': '*'
			},
			body: JSON.stringify(body)
		});

	await page.route(/terrain\.scouts\.com\.au|cognito-idp/, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		fake.requests.push(
			`${request.method()} ${url.hostname.split('.')[0]}${url.pathname}${url.search}`
		);
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
						id: options.youth ? 'youth-1' : 'leader-1',
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
				results: youth.map((name, i) => ({
					id: `${unitMembers[1]}-m${i}`,
					member_number: `10${i}`,
					first_name: name.split(' ')[0],
					last_name: name.split(' ')[1],
					status: 'active',
					date_of_birth: '2012-06-15',
					unit: { id: unitMembers[1], section: 'scout', duty: 'member', unit_council: false },
					patrol: { id: 'p1', name: 'Kookaburra', duty: 'member' }
				}))
			});
		if (
			/\/(achievements|logbook-metrics)$/.test(url.pathname) ||
			url.pathname.includes('/achievements')
		)
			return json(route, { results: [] });
		if (
			url.pathname.endsWith('assume-profiles') ||
			url.pathname.endsWith('revoke-assumed-profiles')
		)
			return json(route, {});
		if (url.pathname.endsWith('/tree.json')) {
			const stream = url.pathname.split('/')[2];
			return json(route, {
				title: stream[0].toUpperCase() + stream.slice(1),
				stream_id: stream,
				tree: {
					branch_id: stream,
					title: stream,
					stage: 1,
					template_link: `oas/${stream}/1/latest.json`,
					children: []
				}
			});
		}
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
