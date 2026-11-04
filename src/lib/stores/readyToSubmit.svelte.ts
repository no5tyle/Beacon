// Milestones and OAS stages done but not submitted, for Approvals' Submit tab and its badge. Found in the
// background for the chosen unit once its youth's progress loads, so the tab is ready when opened.
// Milestones come from the youth's activity counts; OAS stages from the unit's records of each stage
// with every statement and the logbook ticked.

import type { PendingApproval } from '#lib/model/approvals.js';
import { milestonesReady } from '#lib/model/insights/memberInsightsCalculator.js';
import type { OASStage } from '#lib/model/oas/templates.js';
import type { OASService } from '#lib/services/oas.js';
import type { RecordingService } from '#lib/services/recording.js';
import type { YouthProgress } from '#lib/model/insights/progress.js';
import type { UnitProgressService } from '#lib/services/unitProgress.js';

export interface ReadyItem {
	key: string;
	unitId: string;
	memberId: string;
	name: string;
	title: string;
	milestone?: number;
	stage?: OASStage;
	/** Why Terrain won't take it yet, if it won't */
	blocked: string;
}

export const stageTitle = (stage: OASStage) =>
	`OAS ${stage.stream} ${stage.stage}${stage.branch && stage.branch !== stage.stream.toLowerCase() ? ` ${stage.stageTitle}` : ''}`;

/**
 * Once submitted, a milestone is in Terrain's list, to approve or award there instead. A submitted OAS
 * stage is no longer editable, so it isn't found ready again
 */
export const isSubmitted = (r: ReadyItem, pending: readonly PendingApproval[]) =>
	r.milestone !== undefined &&
	pending.some(
		(a) =>
			a.memberId === r.memberId &&
			a.achievementType === 'milestone' &&
			a.achievementName.endsWith(` ${r.milestone}`)
	);

export class ReadyToSubmit {
	/** The unit the items are for */
	unitId = $state('');
	items = $state<ReadyItem[]>([]);
	/** Still looking, after the youth's progress has loaded */
	checking = $state(false);
	// The unit's progress the items were found from: a save clears it, and they're found again
	private source: readonly YouthProgress[] | undefined;
	private loading = '';

	constructor(
		private readonly unitProgress: UnitProgressService,
		private readonly recording: RecordingService,
		private readonly oas: OASService
	) {}

	/**
	 * Finds what's ready in the unit, unless it's known from the unit's current progress or being found.
	 * Never throws: without the unit's progress there's just nothing listed
	 */
	async loadIfNeeded(unitId: string, again = false): Promise<void> {
		if (!unitId || this.loading === unitId) return;
		if (
			!again &&
			unitId === this.unitId &&
			this.source &&
			this.unitProgress.peek(unitId) === this.source
		)
			return;
		this.loading = unitId;
		if (unitId !== this.unitId) {
			this.unitId = unitId;
			this.items = [];
		}
		this.checking = true;
		const found: ReadyItem[] = [];
		let source: readonly YouthProgress[] | undefined;
		try {
			source = await this.unitProgress.get(unitId);
			for (const p of source)
				for (const milestone of milestonesReady(p))
					found.push({
						key: `${p.memberId}-milestone-${milestone}`,
						unitId,
						memberId: p.memberId,
						name: p.memberName,
						title: `Milestone ${milestone}`,
						milestone,
						blocked: ''
					});
			for (const r of await this.recording.stagesReadyToSubmit(unitId, await this.oas.stageList()))
				found.push({
					key: `${r.memberId}-${r.stage.templateLink}`,
					unitId,
					memberId: r.memberId,
					name: r.name,
					title: stageTitle(r.stage),
					stage: r.stage,
					blocked: r.blocked
				});
		} catch (error) {
			console.info('Ready to submit: not found', error);
		}
		if (this.loading !== unitId) return;
		this.loading = '';
		this.items = found;
		this.source = source;
		this.checking = false;
	}

	/** What's ready in the unit, leaving out milestones Terrain already lists */
	readyIn(unitId: string, pending: readonly PendingApproval[]): ReadyItem[] {
		return unitId === this.unitId ? this.items.filter((r) => !isSubmitted(r, pending)) : [];
	}

	/** Drops those just submitted, until they're found again from the unit's progress */
	submitted(keys: readonly string[]): void {
		this.items = this.items.filter((r) => !keys.includes(r.key));
	}

	clear(): void {
		this.unitId = '';
		this.items = [];
		this.checking = false;
		this.source = undefined;
		this.loading = '';
	}
}
