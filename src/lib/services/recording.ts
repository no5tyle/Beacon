// Recording OAS statements and submitting stages for review on a youth's behalf.
// Ported from Beacon's C# OASRecordingService.

import { today as todayDate } from '#lib/model/dates.js';
import type { Answers } from '#lib/model/oas/answers.js';
import {
	addVerifications,
	allComplete,
	canReceiveCredit,
	createBody,
	isEditable,
	MAX_LEADER_VERIFIABLE_STAGE,
	statements,
	submitBody,
	updateBody,
	VERIFIER_TYPE_MEMBER,
	type OASRecord,
	type OASStatement,
	type OASVerifier
} from '#lib/model/oas/recording.js';
import {
	milestoneReviewBody,
	milestoneToSubmit,
	requirementsComplete,
	terrainReason
} from '#lib/model/oas/milestoneReview.js';
import { latestByMember, type SignOffOutcome, type UnitOASRecord } from '#lib/model/oas/signOff.js';
import type { OASStage, OASTemplate } from '#lib/model/oas/templates.js';
import { compareText } from '#lib/model/util.js';
import type { TerrainWriteResult } from '#lib/terrain/errors.js';
import type { TerrainAchievement } from '#lib/terrain/types.js';
import type { BeaconContext } from './context.js';
import type { UnitProgressService } from './unitProgress.js';

/** One youth's OAS stage as Record OAS shows it */
export interface OASRecordingState {
	memberId: string;
	stage: OASStage;
	template: OASTemplate;
	/** Their record for the stage, as Terrain returned it; null if they haven't started it */
	achievement: OASRecord | null;
	statements: OASStatement[];
	completedStagesInStream: number[];
}

export const recordStatus = (state: OASRecordingState) => String(state.achievement?.status ?? '');
const recordId = (state: OASRecordingState) => String(state.achievement?.id ?? '');

const COMPLETE_STATUSES = ['awarded', 'approved'];

const failure = (body: string): TerrainWriteResult => ({ success: false, status: 0, body });

/** Saving without the switch would send the change as the leader, so stop and say so */
function couldNotActAsYouth(assumed: TerrainWriteResult): TerrainWriteResult {
	const reason = assumed.status > 0 ? `Terrain said ${assumed.status}.` : assumed.body;
	return failure(
		`Terrain wouldn't let Beacon act as this youth, so nothing was saved. ${reason}`.trim()
	);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class RecordingService {
	constructor(
		private readonly context: BeaconContext,
		private readonly unitProgress: UnitProgressService
	) {}

	loadTemplate(stage: OASStage): Promise<OASTemplate> {
		return this.context.terrain.oasTemplate(stage.templateLink);
	}

	/** A youth's record for a stage, with the stage's statements and which are done */
	async loadStage(memberId: string, stage: OASStage): Promise<OASRecordingState> {
		const template = await this.loadTemplate(stage);
		const records = await this.context.terrain.memberAchievements(
			memberId,
			'outdoor_adventure_skill'
		);
		const stream = stage.stream.toLowerCase();
		const inStream = records.filter((r) => r.achievement_meta?.stream === stream);
		const completed = inStream
			.filter((r) => COMPLETE_STATUSES.includes(r.status))
			.map((r) => r.achievement_meta?.stage ?? 0);
		// Prefer a completed record, otherwise the one being worked on
		const forStage =
			inStream
				.filter(
					(r) =>
						r.achievement_meta?.stage === stage.stage && r.achievement_meta?.branch === stage.branch
				)
				.sort(
					(a, b) =>
						Number(COMPLETE_STATUSES.includes(b.status)) -
							Number(COMPLETE_STATUSES.includes(a.status)) ||
						compareText(String(b.last_updated ?? ''), String(a.last_updated ?? ''))
				)[0] ?? null;

		return {
			memberId,
			stage,
			template,
			achievement: forStage as OASRecord | null,
			statements: statements(template, (forStage?.answers as Answers | undefined) ?? null),
			completedStagesInStream: completed
		};
	}

	/** Adds the newly ticked statements to the youth's record, as the youth (Terrain's rule) */
	async saveVerifications(
		state: OASRecordingState,
		newlyTicked: OASStatement[],
		verifier: OASVerifier
	): Promise<TerrainWriteResult> {
		if (newlyTicked.length === 0) return failure('Nothing new to save.');
		if (!isEditable(recordStatus(state)))
			return failure("This stage can't be changed while it is submitted or complete.");
		if (state.stage.stage > MAX_LEADER_VERIFIABLE_STAGE && newlyTicked.some((s) => !s.isLogbook))
			return failure(
				`Adult leaders can't verify Stage ${MAX_LEADER_VERIFIABLE_STAGE + 1} and above.`
			);

		const unitId = this.context.unitId;
		const section = this.context.sectionOf(unitId);
		try {
			const outcome = await this.context.terrain.actAsYouth(state.memberId, async (youth) => {
				if (!state.achievement) {
					const answers = addVerifications(null, newlyTicked, verifier, todayDate());
					return youth.createAchievement(
						state.memberId,
						createBody(state.template, state.stage, section, answers)
					);
				}
				// Re-read the record so a change made in Terrain since the page loaded isn't overwritten
				const latest = (
					await youth.memberAchievements(state.memberId, 'outdoor_adventure_skill')
				).find((a: TerrainAchievement) => a.id === recordId(state));
				if (
					!latest ||
					String(latest.last_updated ?? '') !== String(state.achievement.last_updated ?? '')
				)
					return failure(
						'This stage has changed in Terrain since you opened it. Reload and try again.'
					);
				const answers = addVerifications(
					(latest.answers as Answers | undefined) ?? null,
					newlyTicked,
					verifier,
					todayDate()
				);
				return youth.updateAchievement(
					state.memberId,
					recordId(state),
					updateBody(latest as OASRecord, answers)
				);
			});
			if (!outcome.acted) return couldNotActAsYouth(outcome.result);
			if (outcome.value.success) this.unitProgress.clear(unitId);
			return outcome.value;
		} catch (error) {
			return failure(errorMessage(error));
		}
	}

	async submitForReview(state: OASRecordingState): Promise<TerrainWriteResult> {
		if (!state.achievement || !isEditable(recordStatus(state)))
			return failure('Save the stage first. Only stages in progress can be submitted.');
		if (!allComplete(state.statements))
			return failure('Every statement, including the logbook, must be ticked before submitting.');
		if (!canReceiveCredit(state.stage.stage, state.completedStagesInStream))
			return failure(
				`Stage ${state.stage.stage - 3} of this stream must be complete before Stage ${state.stage.stage} can be submitted.`
			);

		const unitId = this.context.unitId;
		try {
			const outcome = await this.context.terrain.actAsYouth(state.memberId, (youth) =>
				youth.submitOnBehalf(
					state.memberId,
					recordId(state),
					submitBody(unitId, this.leaderMemberId())
				)
			);
			if (!outcome.acted) return couldNotActAsYouth(outcome.result);
			if (outcome.value.success) this.unitProgress.clear(unitId);
			return outcome.value;
		} catch (error) {
			return failure(errorMessage(error));
		}
	}

	/** Every youth's record for the stage in one request, to show who each statement would be new for */
	async loadUnitStage(unitId: string, stage: OASStage): Promise<Map<string, UnitOASRecord>> {
		const records = await this.context.terrain.unitOASAchievements(
			unitId,
			stage.stream.toLowerCase(),
			stage.branch,
			stage.stage
		);
		return latestByMember(records as unknown as UnitOASRecord[], stage.branch);
	}

	/** Adds the statements one youth doesn't have yet, reading their record fresh from Terrain first */
	async signOff(
		memberId: string,
		stage: OASStage,
		inputIds: readonly string[],
		verifier: OASVerifier
	): Promise<SignOffOutcome> {
		let state: OASRecordingState;
		try {
			state = await this.loadStage(memberId, stage);
		} catch {
			return {
				state: 'Failed',
				savedCount: 0,
				message: "Couldn't load their record from Terrain."
			};
		}
		if (!isEditable(recordStatus(state)))
			return { state: 'Skipped', savedCount: 0, message: 'Already submitted or complete.' };
		const newlyTicked = state.statements.filter(
			(s) => inputIds.includes(s.inputId) && !s.alreadyDone
		);
		if (newlyTicked.length === 0)
			return { state: 'Skipped', savedCount: 0, message: 'Already had these.' };

		const result = await this.saveVerifications(state, newlyTicked, verifier);
		if (result.success) return { state: 'Saved', savedCount: newlyTicked.length, message: '' };
		return {
			state: 'Failed',
			savedCount: 0,
			message:
				result.status > 0 ? `Terrain didn't accept it (response ${result.status}).` : result.body
		};
	}

	/** Submits one youth's stage for Unit Council review, reading their record fresh from Terrain first */
	async submitStage(memberId: string, stage: OASStage): Promise<SignOffOutcome> {
		let state: OASRecordingState;
		try {
			state = await this.loadStage(memberId, stage);
		} catch {
			return {
				state: 'Failed',
				savedCount: 0,
				message: "Couldn't load their record from Terrain."
			};
		}
		const result = await this.submitForReview(state);
		if (result.success) return { state: 'Saved', savedCount: 0, message: '' };
		return {
			state: 'Failed',
			savedCount: 0,
			message:
				result.status > 0 ? `Terrain didn't accept it (response ${result.status}).` : result.body
		};
	}

	/**
	 * Submits a milestone whose requirements are done for the Unit Council's review, as Terrain's own
	 * Milestones page does: as the youth, a leader review is saved for each lead, then it's submitted
	 */
	async submitMilestone(memberId: string, stage: number, unitId: string): Promise<SignOffOutcome> {
		const failed = (message: string): SignOffOutcome => ({
			state: 'Failed',
			savedCount: 0,
			message
		});
		const section = this.context.sectionOf(unitId);
		let record;
		let template;
		try {
			record = milestoneToSubmit(
				await this.context.terrain.memberAchievements(memberId, 'milestone'),
				section,
				stage
			);
			if (!record)
				return { state: 'Skipped', savedCount: 0, message: 'Already submitted or complete.' };
			if (!requirementsComplete(record))
				return failed("Terrain doesn't count this milestone's activities as done yet.");
			template = await this.context.terrain.milestoneReviewTemplate(section, stage);
		} catch {
			return failed("Couldn't load their milestone from Terrain.");
		}
		const body = milestoneReviewBody(record, template);
		try {
			const outcome = await this.context.terrain.actAsYouth(memberId, async (youth) => {
				const saved = await youth.updateAchievement(memberId, record.id, body);
				if (!saved.success) return { step: 'saving the lead reviews', result: saved };
				const submitted = await youth.submitOnBehalf(
					memberId,
					record.id,
					submitBody(unitId, this.leaderMemberId())
				);
				return { step: 'submitting it', result: submitted };
			});
			if (!outcome.acted) return failed(couldNotActAsYouth(outcome.result).body);
			const { step, result } = outcome.value;
			if (!result.success) {
				const reason = terrainReason(result.body);
				return failed(
					result.status > 0
						? `Terrain didn't accept ${step} (response ${result.status})${reason ? `: ${reason}` : '.'}`
						: result.body
				);
			}
			this.unitProgress.clear(unitId);
			return { state: 'Saved', savedCount: 0, message: '' };
		} catch (error) {
			return failed(errorMessage(error));
		}
	}

	/** The signed in leader, recorded as the verifier */
	defaultVerifier(): OASVerifier {
		const profile = this.context.profiles?.profiles[0];
		const email = this.context.user?.UserAttributes?.find((a) => a.Name === 'email')?.Value ?? '';
		return { type: VERIFIER_TYPE_MEMBER, name: profile?.member.name ?? '', contact: email };
	}

	private leaderMemberId(): string {
		return this.context.profiles?.profiles[0]?.member.id ?? '';
	}
}
