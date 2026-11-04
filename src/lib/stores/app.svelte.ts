// Who is signed in, their groups and units, and the chosen unit. Held in memory only, apart from the
// chosen unit and branch, which are remembered on the device. Ported from Beacon's C# StorageService.

import { isYouthProfile, onUnitCouncil, Terrain, type LoginResult } from '#lib/terrain/client.js';
import { SessionExpiredError, TerrainError } from '#lib/terrain/errors.js';
import type { Profile, Profiles, TerrainUser } from '#lib/terrain/types.js';
import { compareText, distinctBy } from '#lib/model/util.js';
import { sectionFromProfiles, type BeaconContext } from '#lib/services/context.js';
import { requestLog } from './log.svelte.js';
import { forgetLogin, hasSavedLogin, readSavedLogin, saveLogin } from './savedLogin.js';
import { readSetting, UNIT_KEY, writeSetting } from './storage.js';

export interface NamedItem {
	id: string;
	name: string;
}

export const VERSION = __BEACON_VERSION__;

export class AppState implements BeaconContext {
	terrain: Terrain;
	isSignedIn = $state(false);
	profiles = $state<Profiles | null>(null);
	user = $state<TerrainUser | null>(null);
	memberName = $state('');
	groupId = $state('');
	groupName = $state('');
	suppressLastName = $state(false);
	/** Set when Terrain wouldn't renew the login, so the login page can say why the leader is back there */
	sessionExpired = $state(false);
	/** Signing back in from a login kept on this device, so pages wait rather than going to the login */
	resuming = $state(hasSavedLogin());
	/** Set when a kept login couldn't be used because Terrain couldn't be reached */
	resumeFailed = $state(false);
	private chosenUnitId = $state('');
	/** Called when the signed in leader changes or logs out, so services can forget what they loaded */
	private resetListeners: (() => void)[] = [];

	constructor(terrain?: Terrain) {
		this.terrain = terrain ?? new Terrain({ log: (entry) => requestLog.add(entry, VERSION) });
		this.terrain.onSessionExpired(() => this.expireSession());
		// Terrain can hand out a new refresh token as it renews the login; a kept login keeps the latest
		this.terrain.onRefreshToken((refreshToken) => {
			const session = this.terrain.session;
			if (hasSavedLogin() && session) void saveLogin({ clientId: session.clientId, refreshToken });
		});
	}

	/** The leader's groups, in name order */
	get groups(): NamedItem[] {
		const groups = (this.profiles?.profiles ?? [])
			.filter((p) => p.group && p.unit)
			.map((p) => ({ id: p.group!.id, name: p.group!.name }));
		return distinctBy(groups, (g) => g.id).sort((a, b) => compareText(a.name, b.name));
	}

	/** The leader's units in the chosen group */
	get units(): NamedItem[] {
		const units = (this.profiles?.profiles ?? [])
			.filter(
				(p) => p.unit && p.group?.name === this.groupName && p.member.name === this.memberName
			)
			.map((p) => ({ id: p.unit!.id, name: p.unit!.name }));
		return distinctBy(units, (u) => u.id);
	}

	/** The chosen unit, as a list (empty when none is chosen), for pages that list a unit's things */
	get chosenUnits(): NamedItem[] {
		return this.units.filter((u) => u.id === this.unitId);
	}

	/** The chosen unit, or the only unit when there is just one */
	get unitId(): string {
		if (!this.chosenUnitId && this.units.length === 1) return this.units[0].id;
		return this.chosenUnitId;
	}

	set unitId(id: string) {
		this.chosenUnitId = id;
	}

	get unitName(): string {
		return this.units.find((u) => u.id === this.unitId)?.name ?? '';
	}

	/** The member's profile for a unit of theirs */
	profileFor(unitId: string): Profile | undefined {
		return this.profiles?.profiles.find((p) => p.group && p.unit?.id === unitId);
	}

	/** Whether the member is youth in the unit, rather than a leader */
	youthIn(unitId: string): boolean {
		const profile = this.profileFor(unitId);
		return profile ? isYouthProfile(profile) : false;
	}

	/**
	 * Youth in the chosen unit: Beacon shows them their own progress, recording SIAs, and Approvals if
	 * they're on its Unit Council. With no unit chosen, youth only when they're youth in every unit
	 */
	get isYouth(): boolean {
		if (!this.isSignedIn || !this.profiles) return false;
		if (this.unitId) return this.youthIn(this.unitId);
		return this.profiles.profiles.length > 0 && this.profiles.profiles.every(isYouthProfile);
	}

	/** On the chosen unit's Unit Council */
	get onUnitCouncil(): boolean {
		return onUnitCouncil(this.profileFor(this.unitId));
	}

	/** The signed in member's id in the chosen unit (or their first profile's) */
	get memberId(): string {
		return (this.profileFor(this.unitId) ?? this.profiles?.profiles[0])?.member.id ?? '';
	}

	sectionOf(unitId: string): string {
		return sectionFromProfiles(this.profiles, unitId);
	}

	get section(): string {
		return this.sectionOf(this.unitId);
	}

	onReset(listener: () => void): () => void {
		this.resetListeners.push(listener);
		return () => (this.resetListeners = this.resetListeners.filter((l) => l !== listener));
	}

	/**
	 * Logs in and loads the leader's profiles: whether they're a leader, their groups, and the unit
	 * chosen last time on this device if it's still one of theirs
	 */
	async login(
		branch: string,
		memberNumber: string,
		password: string,
		keepSignedIn = false
	): Promise<{ ok: true } | { ok: false; message: string }> {
		this.signOut();
		let result: LoginResult;
		try {
			result = await this.terrain.login(branch, memberNumber, password);
		} catch (error) {
			return { ok: false, message: error instanceof TerrainError ? error.message : String(error) };
		}
		if (!result.ok)
			return { ok: false, message: result.message || "Terrain didn't accept the login." };

		const finished = await this.loadMember();
		if (!finished.ok) return finished;
		// Kept on this device only when asked; logging in without the box forgets any kept before
		const session = this.terrain.session;
		if (keepSignedIn && session?.refreshToken)
			await saveLogin({ clientId: session.clientId, refreshToken: session.refreshToken });
		else await forgetLogin();
		return finished;
	}

	/**
	 * Signs back in from the login kept on this device, if there is one. A login Terrain won't renew is
	 * forgotten; one that couldn't be tried (no signal) is kept for next time
	 */
	async resume(): Promise<void> {
		try {
			const saved = await readSavedLogin();
			if (!saved) {
				await forgetLogin();
				return;
			}
			const outcome = await this.terrain.resume(saved.clientId, saved.refreshToken);
			if (outcome === 'refused') {
				await forgetLogin();
				this.sessionExpired = true;
				return;
			}
			if (outcome === 'unreachable') {
				this.resumeFailed = true;
				return;
			}
			const finished = await this.loadMember();
			if (!finished.ok) this.resumeFailed = true;
		} finally {
			this.resuming = false;
		}
	}

	/** Tries the kept login again, after Terrain couldn't be reached */
	retryResume(): void {
		if (this.resuming || !hasSavedLogin()) return;
		this.resuming = true;
		void this.resume();
	}

	/** Once Terrain has given tokens: the member's details, profiles, groups and remembered unit */
	private async loadMember(): Promise<{ ok: true } | { ok: false; message: string }> {
		try {
			this.user = await this.terrain.user();
			const profiles = await this.terrain.profiles();
			this.profiles = profiles;
			const first = profiles.profiles[0];
			if (first) {
				this.memberName = first.member.name ?? '';
				// Acting as a youth switches profile unless the member is youth everywhere, or it's themselves
				this.terrain.setYouth(
					profiles.profiles.every(isYouthProfile),
					profiles.profiles.map((p) => p.member.id)
				);
			}
			const groups = this.groups;
			this.groupId = groups.length === 1 ? groups[0].id : '';
			this.groupName = groups.length === 1 ? groups[0].name : '';
			this.useRememberedUnit();
			this.isSignedIn = true;
			this.sessionExpired = false;
			this.resumeFailed = false;
			return { ok: true };
		} catch (error) {
			this.signOut();
			const message =
				error instanceof SessionExpiredError || !(error instanceof Error)
					? "Couldn't finish logging in. Try again."
					: error.message;
			return { ok: false, message };
		}
	}

	chooseGroup(groupId: string): void {
		this.groupId = groupId;
		this.groupName = this.groups.find((g) => g.id === groupId)?.name ?? '';
		// A unit from the previous group doesn't belong to this one; use the remembered unit if it's in this group
		if (!this.units.some((u) => u.id === this.chosenUnitId)) this.chosenUnitId = '';
		if (!this.chosenUnitId) this.useRememberedUnit();
	}

	/** Every page works on the unit chosen here, and it's remembered on this device for next time */
	chooseUnit(unitId: string): void {
		this.chosenUnitId = unitId;
		writeSetting(UNIT_KEY, unitId);
	}

	private useRememberedUnit(): void {
		const saved = readSetting(UNIT_KEY);
		if (saved && this.units.some((u) => u.id === saved)) this.chosenUnitId = saved;
	}

	/** Terrain wouldn't renew the login: sign out, and the layout takes the leader to the login page */
	expireSession(): void {
		if (!this.isSignedIn) return;
		this.logout();
		this.sessionExpired = true;
	}

	/** Signs out of this tab without touching a login kept on the device */
	private signOut(): void {
		this.terrain.logout();
		this.isSignedIn = false;
		this.profiles = null;
		this.user = null;
		this.memberName = '';
		this.groupId = '';
		this.groupName = '';
		this.chosenUnitId = '';
		this.resetListeners.forEach((listener) => listener());
	}

	/** Logout: signs out and forgets any login kept on this device */
	logout(): void {
		this.signOut();
		void forgetLogin();
	}
}
