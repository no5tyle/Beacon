// Builds the Insights reports from the unit's progress and the OAS stages youth are working on.
// Ported from Beacon's C# InsightsService.

import { today as todayDate } from '#lib/model/dates.js';
import {
	buildInsights,
	isCoreStream,
	MAX_STAGE,
	moveUpCandidates,
	nextStageDemand,
	stageFor,
	stagesForDetail,
	STREAMS
} from '#lib/model/insights/insightsCalculator.js';
import { buildMemberInsights } from '#lib/model/insights/memberInsightsCalculator.js';
import type { MemberInsightsReport } from '#lib/model/insights/memberModels.js';
import type {
	InsightsReport,
	OASRequirementStatus,
	YouthRecord
} from '#lib/model/insights/models.js';
import {
	maximumStage,
	minimumStage,
	rulesFor,
	type InsightsSettings
} from '#lib/model/insights/settings.js';
import type { BeaconContext } from './context.js';
import type { MembersService } from './members.js';
import { OASService, worksheetAnswers } from './oas.js';
import { progressFromDetails, type ProgressDetails } from './progress.js';
import type { UnitProgressService } from './unitProgress.js';

export class InsightsService {
	// The last analysis, so the report can be rebuilt straight away when focus youth change
	private last: {
		unitId: string;
		youth: YouthRecord[];
		requirements: OASRequirementStatus[];
	} | null = null;

	constructor(
		private readonly context: BeaconContext,
		private readonly members: MembersService,
		private readonly unitProgress: UnitProgressService,
		private readonly oas: OASService
	) {}

	async report(
		unitId: string,
		settings: InsightsSettings,
		focusIds: readonly string[] = []
	): Promise<InsightsReport> {
		const section = this.context.sectionOf(unitId);
		const rules = rulesFor(settings, section);
		const today = todayDate();

		const members = await this.members.get(unitId);
		const progress = await this.unitProgress.get(unitId);
		const youth: YouthRecord[] = progress.map((p) => ({
			memberId: p.memberId,
			memberName: p.memberName,
			patrol: p.memberPatrol,
			dateOfBirth: members.find((m) => m.id === p.memberId)?.dateOfBirth ?? null,
			progress: p
		}));

		const candidates = moveUpCandidates(youth, rules, settings, today, [], focusIds);
		const minStage = minimumStage(settings, section);
		const highestStage = maximumStage(settings, section);
		const demand = nextStageDemand(
			youth,
			new Set(candidates.map((c) => c.memberId)),
			settings.includeNonCoreOAS,
			minStage,
			highestStage
		);
		const detail = stagesForDetail(
			demand,
			candidates,
			youth,
			settings.maxGapStages,
			settings.includeNonCoreOAS,
			minStage,
			highestStage
		);

		const requirements: OASRequirementStatus[] = [];
		const stages = await this.oas.stageList();
		for (const { stream, stage: stageNumber } of detail) {
			const stage = OASService.findStage(stages, stream, stageNumber);
			if (!stage) continue;
			try {
				const rows = await this.oas.templateRows(stage.templateLink.replace('/latest.json', ''));
				const records = await this.oas.unitRecords(unitId, stage);
				const answers = worksheetAnswers(rows, records, members, (m) =>
					this.members.displayName(m)
				);
				requirements.push(
					...answers
						.filter((a) => !a.awarded)
						.map((a) => ({
							stream,
							stage: stageNumber,
							inputGroup: a.inputTitle,
							inputLabel: a.inputLabel,
							inputDetail: rows.find((t) => t.inputId === a.inputId)?.inputDetail ?? '',
							memberId: a.memberId,
							answered: a.answered
						}))
				);
			} catch (error) {
				// One stage failing shouldn't stop the rest of the analysis
				console.warn(
					`Insights: couldn't load OAS requirements for ${stream} ${stageNumber}`,
					error
				);
			}
		}

		this.last = { unitId, youth, requirements };
		return buildInsights(section, youth, requirements, settings, today, focusIds);
	}

	/**
	 * Rebuilds from the last analysis without asking Terrain again. Stage detail for newly added
	 * focus youth only arrives with the next full analysis.
	 */
	rebuild(
		unitId: string,
		settings: InsightsSettings,
		focusIds: readonly string[]
	): InsightsReport | null {
		if (!this.last || this.last.unitId !== unitId || this.last.youth.length === 0) return null;
		return buildInsights(
			this.context.sectionOf(unitId),
			this.last.youth,
			this.last.requirements,
			settings,
			todayDate(),
			focusIds
		);
	}

	/** Insights for one youth on the Progress details page */
	async memberReport(
		unitId: string,
		details: ProgressDetails,
		settings: InsightsSettings
	): Promise<MemberInsightsReport> {
		const section = this.context.sectionOf(unitId);
		const rules = rulesFor(settings, section);
		const minStage = minimumStage(settings, section);
		const highestStage = maximumStage(settings, section);
		const member = details.member;
		const youth: YouthRecord = {
			memberId: member.id,
			memberName: `${member.firstName} ${member.lastName}`,
			patrol: member.patrolName,
			dateOfBirth: member.dateOfBirth,
			progress: progressFromDetails(details, section)
		};

		// Requirement detail for every stage in progress, plus the next stage of each core stream
		const started = [
			...new Set(
				details.oasSummaries
					.filter((o) => !o.awarded && !o.approved)
					.filter((o) => settings.includeNonCoreOAS || isCoreStream(o.stream))
					.filter((o) => o.stage >= minStage && o.stage <= highestStage)
					.map((o) => `${o.stream}/${o.stage}`)
			)
		];
		const forDetail = started.map((key) => ({
			stream: key.split('/')[0],
			stage: Number(key.split('/')[1])
		}));
		for (const stream of STREAMS.filter((s) => s.isCore)) {
			const next = stageFor(youth.progress, stream.key) + 1;
			if (
				next <= MAX_STAGE &&
				next >= minStage &&
				next <= highestStage &&
				!forDetail.some((s) => s.stream === stream.key)
			)
				forDetail.push({ stream: stream.key, stage: next });
		}

		const requirements: OASRequirementStatus[] = [];
		const stages = await this.oas.stageList();
		for (const { stream, stage: stageNumber } of forDetail) {
			const template = details.oasSummaries.find(
				(o) => o.stream === stream && o.stage === stageNumber && o.template
			)?.template;
			const stage =
				(template ? stages.find((s) => s.templateLink === `${template}/latest.json`) : undefined) ??
				OASService.findStage(stages, stream, stageNumber);
			if (!stage) continue;
			try {
				const rows = await this.oas.templateRows(stage.templateLink.replace('/latest.json', ''));
				const records = await this.oas.unitRecords(unitId, stage);
				const answers = worksheetAnswers(rows, records, [member], (m) =>
					this.members.displayName(m)
				);
				requirements.push(
					...answers
						.filter((a) => !a.awarded)
						.map((a) => ({
							stream,
							stage: stageNumber,
							inputGroup: a.inputTitle,
							inputLabel: a.inputLabel,
							inputDetail: rows.find((t) => t.inputId === a.inputId)?.inputDetail ?? '',
							memberId: youth.memberId,
							answered: a.answered
						}))
				);
			} catch (error) {
				console.warn(
					`Insights: couldn't load OAS requirements for ${stream} ${stageNumber}`,
					error
				);
			}
		}

		return buildMemberInsights(youth, requirements, new Set(started), rules, todayDate(), {
			includeNonCoreOAS: settings.includeNonCoreOAS,
			minStage,
			highestStage
		});
	}
}
