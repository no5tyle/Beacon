// What a youth's printed progress report needs beyond their progress details: each OAS stage they have a
// record for, with its "I can" statements and which they've achieved.

import { isCoreStream, streamDisplay } from '#lib/model/insights/insightsCalculator.js';
import type { Answers } from '#lib/model/oas/answers.js';
import { statements } from '#lib/model/oas/recording.js';
import type { OASTemplate } from '#lib/model/oas/templates.js';
import { asc, sortBy } from '#lib/model/util.js';
import type { TerrainAchievement } from '#lib/terrain/types.js';
import type { BeaconContext } from './context.js';

export interface ReportStatement {
	group: string;
	label: string;
	achieved: boolean;
}

export interface ReportStage {
	stream: string;
	streamDisplay: string;
	stage: number;
	status: 'awarded' | 'approved' | 'started';
	/** When it was awarded, as Terrain gives it, e.g. "2026-04-15" */
	awarded: string;
	statements: ReportStatement[];
}

const COMPLETE = ['awarded', 'approved'];

// The date it was awarded: when it was brought across into Terrain, if it was, or else its last update
const awardedOn = (record: TerrainAchievement) =>
	(
		(record.imported as { date_awarded?: string } | undefined)?.date_awarded ||
		record.status_updated ||
		''
	).slice(0, 10);

export class ReportService {
	private readonly templates = new Map<string, Promise<OASTemplate>>();

	constructor(private readonly context: BeaconContext) {}

	/**
	 * Every OAS stage the youth has a record for, lowest first within each stream, with its statements.
	 * A completed stage counts every statement as achieved, as one awarded before Terrain recorded
	 * statements has none ticked.
	 */
	async oasStages(memberId: string, includeNonCore: boolean): Promise<ReportStage[]> {
		const records = await this.context.terrain.memberAchievements(
			memberId,
			'outdoor_adventure_skill'
		);
		const byStage = new Map<string, TerrainAchievement>();
		for (const record of records) {
			const stream = record.achievement_meta?.stream ?? '';
			if (!stream || !record.template || (!includeNonCore && !isCoreStream(stream))) continue;
			const key = `${stream}/${record.achievement_meta?.stage ?? 0}`;
			// The completed record where there are several, e.g. one started again after it was awarded
			const kept = byStage.get(key);
			if (!kept || (COMPLETE.includes(record.status) && !COMPLETE.includes(kept.status)))
				byStage.set(key, record);
		}

		const stages = await Promise.all(
			[...byStage.values()].map(async (record): Promise<ReportStage | null> => {
				const complete = COMPLETE.includes(record.status);
				try {
					const template = await this.template(record.template!);
					return {
						stream: record.achievement_meta?.stream ?? '',
						streamDisplay: streamDisplay(record.achievement_meta?.stream ?? ''),
						stage: record.achievement_meta?.stage ?? 0,
						status: record.status === 'awarded' ? 'awarded' : complete ? 'approved' : 'started',
						awarded: record.status === 'awarded' ? awardedOn(record) : '',
						statements: statements(template, (record.answers as Answers | undefined) ?? null)
							.filter((s) => !s.isLogbook)
							.map((s) => ({ group: s.group, label: s.label, achieved: complete || s.alreadyDone }))
					};
				} catch (error) {
					console.warn('Report: no template for', record.template, error);
					return null;
				}
			})
		);
		return sortBy(
			stages.filter((s): s is ReportStage => s !== null),
			asc((s) => s.streamDisplay),
			asc((s) => s.stage)
		);
	}

	/** Templates are the same for everyone, so each is fetched once */
	private template(link: string): Promise<OASTemplate> {
		let template = this.templates.get(link);
		if (!template) {
			template = this.context.terrain.oasTemplate(link);
			template.catch(() => this.templates.delete(link));
			this.templates.set(link, template);
		}
		return template;
	}
}
