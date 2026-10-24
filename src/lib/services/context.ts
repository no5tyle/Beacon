import type { Terrain } from '#lib/terrain/client.js';
import type { Profiles, TerrainUser } from '#lib/terrain/types.js';

/**
 * What the services need to know about the signed in leader. The app's state provides it; tests give a
 * plain object, so the services can be tested without the app.
 */
export interface BeaconContext {
	terrain: Terrain;
	readonly isSignedIn: boolean;
	/** A youth member logged in, rather than a leader */
	readonly isYouth: boolean;
	readonly profiles: Profiles | null;
	readonly user: TerrainUser | null;
	/** Show only the first letter of youth's last names */
	readonly suppressLastName: boolean;
	/** The chosen unit's id, or "" when none is chosen */
	readonly unitId: string;
	/** A unit's section, e.g. "scout", from the leader's profiles ("" if it isn't one of theirs) */
	sectionOf(unitId: string): string;
}

export function sectionFromProfiles(profiles: Profiles | null, unitId: string): string {
	return profiles?.profiles.find((p) => p.group && p.unit?.id === unitId)?.unit?.section ?? '';
}
