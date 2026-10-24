// Loads the slow unit data (every youth's milestones, OAS, SIAs and peak award progress) in the background
// once a leader is signed in and a unit is known, so Insights opens straight away. Ported from Beacon's C# PreloadService.

import type { BeaconContext } from './context.js';
import type { OASService } from './oas.js';
import type { UnitProgressService } from './unitProgress.js';

export class PreloadService {
	constructor(
		private readonly context: BeaconContext,
		private readonly unitProgress: UnitProgressService,
		private readonly oas: OASService
	) {}

	/**
	 * Safe to call often, including part way through logging in: does nothing unless there's something
	 * to load, and never throws back into whatever called it
	 */
	startIfReady(): void {
		try {
			if (!this.context.isSignedIn || this.context.isYouth || !this.context.profiles) return;
			const unitId = this.context.unitId;
			if (!unitId || this.unitProgress.isCached(unitId) || this.unitProgress.isLoading(unitId))
				return;
			void this.preload(unitId);
		} catch (error) {
			console.info('Preload: not started', error);
		}
	}

	private async preload(unitId: string): Promise<void> {
		try {
			await this.oas.stageList();
			await this.unitProgress.get(unitId);
		} catch (error) {
			// Insights loads it again when opened, and shows any error there
			console.info('Preload: unit data not loaded in the background', error);
		}
	}
}
