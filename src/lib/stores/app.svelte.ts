// Who is signed in, their groups and units, and the chosen unit. Held in memory only, apart from the
// chosen unit and branch, which are remembered on the device. Ported from Beacon's C# StorageService.

import { isLeader, Terrain, type LoginResult } from '#lib/terrain/client.js';
import { SessionExpiredError, TerrainError } from '#lib/terrain/errors.js';
import type { Profiles, TerrainUser } from '#lib/terrain/types.js';
import { compareText, distinctBy } from '#lib/model/util.js';
import { sectionFromProfiles, type BeaconContext } from '#lib/services/context.js';
import { requestLog } from './log.svelte.js';
import { readSetting, UNIT_KEY, writeSetting } from './storage.js';

export interface NamedItem {
	id: string;
	name: string;
}

export const VERSION = __BEACON_VERSION__;

export class AppState implements BeaconContext {
	terrain: Terrain;
	isSignedIn = $state(false);
	isYouth = $state(false);
	profiles = $state<Profiles | null>(null);
	user = $state<TerrainUser | null>(null);
	memberName = $state('');
	groupId = $state('');
	groupName = $state('');
	suppressLastName = $state(false);
	private chosenUnitId = $state('');
	/** Called when the signed in leader changes or logs out, so services can forget what they loaded */
	private resetListeners: (() => void)[] = [];

	constructor(terrain?: Terrain) {
		this.terrain = terrain ?? new Terrain({ log: (entry) => requestLog.add(entry, VERSION) });
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
		password: string
	): Promise<{ ok: true } | { ok: false; message: string }> {
		this.logout();
		let result: LoginResult;
		try {
			result = await this.terrain.login(branch, memberNumber, password);
		} catch (error) {
			return { ok: false, message: error instanceof TerrainError ? error.message : String(error) };
		}
		if (!result.ok)
			return { ok: false, message: result.message || "Terrain didn't accept the login." };

		try {
			this.user = await this.terrain.user();
			const profiles = await this.terrain.profiles();
			this.profiles = profiles;
			const first = profiles.profiles[0];
			if (first) {
				this.memberName = first.member.name ?? '';
				this.isYouth = !isLeader(profiles);
				this.terrain.setYouth(this.isYouth);
			}
			const groups = this.groups;
			this.groupId = groups.length === 1 ? groups[0].id : '';
			this.groupName = groups.length === 1 ? groups[0].name : '';
			this.useRememberedUnit();
			this.isSignedIn = true;
			return { ok: true };
		} catch (error) {
			this.logout();
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

	logout(): void {
		this.terrain.logout();
		this.isSignedIn = false;
		this.isYouth = false;
		this.profiles = null;
		this.user = null;
		this.memberName = '';
		this.groupId = '';
		this.groupName = '';
		this.chosenUnitId = '';
		this.resetListeners.forEach((listener) => listener());
	}
}
