// Beacon's only way of talking to Terrain. Every request goes through here, so the login, token refresh,
// the profile gate and logging are handled the same way everywhere. Ported from Beacon's C# TerrainAPIService.

import type { OASTemplate, OASTree } from '#lib/model/oas/templates.js';
import {
	refusedMessage,
	SessionExpiredError,
	TerrainError,
	type TerrainWriteResult
} from './errors.js';
import { ProfileGate } from './profileGate.js';
import type {
	AchievementType,
	AuthenticationResult,
	LogbookMetric,
	Profiles,
	TerrainAchievement,
	TerrainUser,
	UnitMember
} from './types.js';

export const COGNITO_ADDRESS = 'https://cognito-idp.ap-southeast-2.amazonaws.com/';
export const MEMBERS_ADDRESS = 'https://members.terrain.scouts.com.au/';
export const TEMPLATES_ADDRESS = 'https://templates.terrain.scouts.com.au/';
export const ACHIEVEMENTS_ADDRESS = 'https://achievements.terrain.scouts.com.au/';

/** Terrain's login app ids. Members belong to one of them, so login tries each in turn */
export const CLIENT_IDS = [
	'6v98tbc09aqfvh52fml3usas3c',
	'5g9rg6ppc5g1pcs5odb7nf7hf9',
	'1u4uajve0lin0ki5n6b61ovva7',
	'21m9o832lp5krto1e8ioo6ldg2'
];

const ACCEPT = 'application/json, text/plain, */*';

/** The signed-in login. Held in memory only: never saved on the device */
export interface Session {
	clientId: string;
	accessToken: string;
	idToken: string;
	refreshToken: string;
	/** When to renew the tokens, in milliseconds since 1970 (a minute before they expire) */
	expiresAt: number;
	/** A youth member logged in: they act as themselves, so there's no profile to switch to */
	isYouth: boolean;
}

export type LoginResult =
	{ ok: true; session: Session } | { ok: false; errorType: string; message: string };

/** One request for the Logging page. Login requests are logged without their bodies, which hold tokens */
export interface RequestLogEntry {
	time: Date;
	method: string;
	url: string;
	status: number;
	body?: string;
	error?: string;
}

export interface TerrainOptions {
	fetch?: typeof fetch;
	/** The current time in milliseconds, for token expiry */
	now?: () => number;
	log?: (entry: RequestLogEntry) => void;
	gate?: ProfileGate;
}

/** State shared by the client and the clients it hands to acting-as-youth spans */
interface Shared {
	session: Session | null;
	refreshing: Promise<void> | null;
	fetch: typeof fetch;
	now: () => number;
	log: (entry: RequestLogEntry) => void;
	onSessionExpired: () => void;
	gate: ProfileGate;
}

export type ActAsYouthResult<T> =
	{ acted: true; value: T } | { acted: false; result: TerrainWriteResult };

const pathPart = (value: string | number) => encodeURIComponent(String(value));

export class Terrain {
	private readonly shared: Shared;
	/** Inside an acting-as-youth span, requests belong to the span and skip the gate */
	private readonly insideYouthSpan: boolean;

	constructor(options: TerrainOptions = {}, shared?: Shared, insideYouthSpan = false) {
		this.shared = shared ?? {
			session: null,
			refreshing: null,
			fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
			now: options.now ?? (() => Date.now()),
			log: options.log ?? (() => {}),
			onSessionExpired: () => {},
			gate: options.gate ?? new ProfileGate()
		};
		this.insideYouthSpan = insideYouthSpan;
	}

	get session(): Session | null {
		return this.shared.session;
	}

	get isSignedIn(): boolean {
		return this.shared.session !== null;
	}

	/** Marks the login as a youth member's or a leader's, once their profiles are known */
	setYouth(isYouth: boolean): void {
		if (this.shared.session) this.shared.session.isYouth = isYouth;
	}

	/** Called when Terrain won't renew the login, so the app can ask the leader to log in again */
	onSessionExpired(listener: () => void): void {
		this.shared.onSessionExpired = listener;
	}

	logout(): void {
		this.shared.session = null;
		this.shared.refreshing = null;
	}

	// Login

	/** Logs in with a member number and password; nothing is kept but the tokens, in memory */
	async login(branch: string, memberNumber: string, password: string): Promise<LoginResult> {
		let lastError = { errorType: '', message: '' };
		for (const clientId of CLIENT_IDS) {
			const response = await this.cognito('InitiateAuth', {
				AuthFlow: 'USER_PASSWORD_AUTH',
				ClientId: clientId,
				AuthParameters: {
					USERNAME: `${branch}-${memberNumber}`,
					PASSWORD: password,
					DEVICE_KEY: null,
					REFRESH_TOKEN: null
				},
				ClientMetadata: {}
			});
			const tokens = response?.AuthenticationResult as AuthenticationResult | undefined;
			if (tokens) {
				this.shared.session = {
					clientId,
					accessToken: tokens.AccessToken,
					idToken: tokens.IdToken,
					refreshToken: tokens.RefreshToken ?? '',
					expiresAt: this.expiry(tokens.ExpiresIn),
					isYouth: false
				};
				return { ok: true, session: this.shared.session };
			}
			lastError = {
				errorType: String(response?.__type ?? ''),
				message: String(response?.message ?? '')
			};
		}
		return { ok: false, ...lastError };
	}

	/** The logged in member's details, e.g. their email address for verifying OAS */
	async user(): Promise<TerrainUser> {
		const session = this.requireSession();
		return ((await this.cognito('GetUser', { AccessToken: session.accessToken })) ??
			{}) as TerrainUser;
	}

	private expiry(expiresInSeconds: number | undefined): number {
		return this.shared.now() + ((expiresInSeconds ?? 0) - 60) * 1000;
	}

	private requireSession(): Session {
		if (!this.shared.session) throw new SessionExpiredError();
		return this.shared.session;
	}

	/** Renews the tokens shortly before they expire. Requests made at the same time share one renewal */
	async refreshIfNeeded(): Promise<void> {
		const session = this.requireSession();
		if (session.expiresAt >= this.shared.now()) return;
		this.shared.refreshing ??= this.refresh(session).finally(() => (this.shared.refreshing = null));
		await this.shared.refreshing;
	}

	private async refresh(session: Session): Promise<void> {
		const response = await this.cognito('InitiateAuth', {
			AuthFlow: 'REFRESH_TOKEN_AUTH',
			ClientId: session.clientId,
			AuthParameters: {
				USERNAME: null,
				PASSWORD: null,
				DEVICE_KEY: null,
				REFRESH_TOKEN: session.refreshToken
			},
			ClientMetadata: {}
		});
		const tokens = response?.AuthenticationResult as AuthenticationResult | undefined;
		if (!tokens) {
			this.logout();
			this.shared.onSessionExpired();
			throw new SessionExpiredError();
		}
		session.accessToken = tokens.AccessToken;
		session.idToken = tokens.IdToken;
		session.expiresAt = this.expiry(tokens.ExpiresIn);
	}

	/** A request to Terrain's login service; null when it gave no usable answer */
	private async cognito(action: string, body: object): Promise<Record<string, unknown> | null> {
		const response = await this.send(
			COGNITO_ADDRESS,
			{
				method: 'POST',
				headers: {
					'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
					'Content-Type': 'application/x-amz-json-1.1',
					accept: ACCEPT
				},
				body: JSON.stringify(body)
			},
			{ logBody: false }
		);
		try {
			return JSON.parse(response.text) as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	// Sending

	/** Sends one request through the profile gate and logs it. Throws a TerrainError when there's no response */
	private async send(
		url: string,
		init: RequestInit,
		{ logBody = true } = {}
	): Promise<{ status: number; ok: boolean; text: string }> {
		const method = init.method ?? 'GET';
		const go = async () => {
			try {
				const response = await this.shared.fetch(url, init);
				const text = await response.text();
				this.shared.log({
					time: new Date(),
					method,
					url,
					status: response.status,
					body: logBody ? text : undefined
				});
				return { status: response.status, ok: response.ok, text };
			} catch (error) {
				const message = refusedMessage(error);
				this.shared.log({ time: new Date(), method, url, status: 0, error: message });
				throw new TerrainError(message);
			}
		};
		return this.insideYouthSpan ? go() : this.shared.gate.request(go);
	}

	private async authHeaders(): Promise<Record<string, string>> {
		await this.refreshIfNeeded();
		return { authorization: this.requireSession().idToken, accept: ACCEPT };
	}

	/** Reads JSON from Terrain. Throws a TerrainError if Terrain can't be reached or answers with an error */
	private async get<T>(url: string, { signedIn = true } = {}): Promise<T> {
		const headers = signedIn ? await this.authHeaders() : { accept: ACCEPT };
		const response = await this.send(url, { method: 'GET', headers });
		if (!response.ok)
			throw new TerrainError(
				`Terrain couldn't load this (response ${response.status}).`,
				response.status
			);
		try {
			return JSON.parse(response.text) as T;
		} catch {
			throw new TerrainError("Terrain's answer couldn't be read.", response.status);
		}
	}

	/** Sends a change; success only when Terrain answers with the status its own app expects */
	private async write(
		method: string,
		url: string,
		body: object | null,
		expectedStatus?: number
	): Promise<TerrainWriteResult> {
		const headers: Record<string, string> = await this.authHeaders();
		if (body) headers['Content-Type'] = 'application/json';
		try {
			const response = await this.send(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined
			});
			const success =
				expectedStatus === undefined ? response.ok : response.status === expectedStatus;
			return { success, status: response.status, body: response.text };
		} catch (error) {
			return {
				success: false,
				status: 0,
				body: error instanceof Error ? error.message : String(error)
			};
		}
	}

	// Reading

	/** The units, groups and roles the logged in member has */
	profiles(): Promise<Profiles> {
		return this.get<Profiles>(`${MEMBERS_ADDRESS}profiles`);
	}

	async unitMembers(unitId: string): Promise<UnitMember[]> {
		const result = await this.get<{ results?: UnitMember[] }>(
			`${MEMBERS_ADDRESS}units/${pathPart(unitId)}/members`
		);
		return result?.results ?? [];
	}

	/** A stream's tree of stages. Public, so it works signed out too */
	oasTree(stream: string): Promise<OASTree> {
		return this.get(`${TEMPLATES_ADDRESS}oas/${pathPart(stream)}/tree.json`, {
			signedIn: this.isSignedIn
		});
	}

	/** A stage's template, from its link in the tree, e.g. "oas/bushwalking/3/latest.json". Public */
	oasTemplate(templateLink: string): Promise<OASTemplate> {
		const path = templateLink.replace(/\/latest\.json$/, '');
		return this.get(`${TEMPLATES_ADDRESS}${path}/latest.json`, { signedIn: this.isSignedIn });
	}

	/** Every youth's record for one OAS stage in a unit, in one request */
	async unitOASAchievements(
		unitId: string,
		stream: string,
		branch: string,
		stage: number
	): Promise<TerrainAchievement[]> {
		const query = `type=outdoor_adventure_skill&stream=${pathPart(stream)}&branch=${pathPart(branch)}&stage=${stage}`;
		const result = await this.get<{ results?: TerrainAchievement[] }>(
			`${ACHIEVEMENTS_ADDRESS}units/${pathPart(unitId)}/achievements?${query}`
		);
		return result?.results ?? [];
	}

	/** A youth's records of one kind, exactly as Terrain returns them, so a save can send back every field */
	async memberAchievements(memberId: string, type: AchievementType): Promise<TerrainAchievement[]> {
		const result = await this.get<{ results?: TerrainAchievement[] }>(
			`${ACHIEVEMENTS_ADDRESS}members/${pathPart(memberId)}/achievements?type=${type}`
		);
		return result?.results ?? [];
	}

	/** Nights camped, kilometres hiked and so on. Terrain only answers this while acting as the youth */
	async logbookMetrics(memberId: string): Promise<LogbookMetric[]> {
		const result = await this.get<{ results?: LogbookMetric[] }>(
			`${ACHIEVEMENTS_ADDRESS}members/${pathPart(memberId)}/logbook-metrics`
		);
		return result?.results ?? [];
	}

	// Changing

	/** Starts a youth's record for a stage they haven't started (POST, answered with 200) */
	createAchievement(memberId: string, body: object): Promise<TerrainWriteResult> {
		return this.write(
			'POST',
			`${ACHIEVEMENTS_ADDRESS}members/${pathPart(memberId)}/achievements`,
			body,
			200
		);
	}

	/** Saves a youth's existing record (PUT, answered with 200) */
	updateAchievement(
		memberId: string,
		achievementId: string,
		body: object
	): Promise<TerrainWriteResult> {
		return this.write(
			'PUT',
			`${ACHIEVEMENTS_ADDRESS}members/${pathPart(memberId)}/achievements/${pathPart(achievementId)}`,
			body,
			200
		);
	}

	/** Submits a youth's stage for Unit Council review on their behalf (POST, answered with 204) */
	submitOnBehalf(
		memberId: string,
		achievementId: string,
		body: object
	): Promise<TerrainWriteResult> {
		return this.write(
			'POST',
			`${ACHIEVEMENTS_ADDRESS}members/${pathPart(memberId)}/achievements/${pathPart(achievementId)}/submit-on-behalf`,
			body,
			204
		);
	}

	// Acting as a youth

	/** Switches Terrain to a youth's profile. Says whether Terrain agreed, so nothing is sent as the leader by mistake */
	assumeProfile(memberId: string): Promise<TerrainWriteResult> {
		if (this.requireSession().isYouth)
			return Promise.resolve({ success: true, status: 0, body: '' });
		return this.write(
			'POST',
			`${MEMBERS_ADDRESS}members/${pathPart(memberId)}/assume-profiles`,
			null
		);
	}

	/** Switches Terrain back to the leader's own profile. Failures are ignored, as there's nothing more to do */
	async revokeAssumedProfiles(): Promise<void> {
		await this.write('POST', `${MEMBERS_ADDRESS}revoke-assumed-profiles`, null);
	}

	/**
	 * Runs the span as the youth: waits for other requests to finish and holds new ones back, switches
	 * Terrain to the youth's profile, runs the span with a client whose requests go straight through,
	 * then switches back. If Terrain won't switch, the span doesn't run.
	 */
	actAsYouth<T>(
		memberId: string,
		span: (youth: Terrain) => Promise<T>
	): Promise<ActAsYouthResult<T>> {
		return this.shared.gate.actAsYouth(async () => {
			const youth = new Terrain({}, this.shared, true);
			// Switched back afterwards even if the switch was refused, as the Blazor app does
			try {
				await youth.revokeAssumedProfiles();
				const assumed = await youth.assumeProfile(memberId);
				if (!assumed.success) return { acted: false, result: assumed };
				return { acted: true, value: await span(youth) };
			} finally {
				await youth.revokeAssumedProfiles();
			}
		});
	}
}

/** A leader, rather than a youth member: a group leader, group support leader or on a Unit Council */
export function isLeader(profiles: Profiles | null | undefined): boolean {
	return (profiles?.profiles ?? []).some(
		(profile) =>
			(profile.group?.roles ?? []).some(
				(role) => role === 'group-leader' || role.startsWith('support-leader-group-')
			) || (profile.unit?.roles ?? []).some((role) => role === 'unit-council')
	);
}
