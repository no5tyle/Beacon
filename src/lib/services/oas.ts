// OAS stages, templates and who has done what. Ported from Beacon's C# OASService.

import { dayMonthYear, toCalendarDate } from '#lib/model/dates.js';
import type { OASStage, OASTreeNode } from '#lib/model/oas/templates.js';
import { asc, sortBy } from '#lib/model/util.js';
import type { Terrain } from '#lib/terrain/client.js';
import type { TerrainAchievement } from '#lib/terrain/types.js';
import type { MemberSummary } from './members.js';

/** The streams in the order Record OAS lists them */
export const OAS_STREAMS = [
	'bushcraft',
	'bushwalking',
	'camping',
	'aquatics',
	'boating',
	'paddling',
	'alpine',
	'cycling',
	'vertical'
];

/** One statement (or other input) of a stage's template, in the template's order */
export interface TemplateRow {
	id: number;
	templateName: string;
	templateTitle: string;
	/** As Terrain writes it, e.g. "Plan>" */
	inputGroup: string;
	inputGroupSort: number;
	inputId: string;
	inputLabel: string;
	inputDetail: string;
}

/** Whether one youth has done one statement of a stage */
export interface WorksheetAnswer {
	templateTitle: string;
	inputId: string;
	/** e.g. "Plan" */
	inputTitle: string;
	inputTitleSortIndex: number;
	inputLabel: string;
	inputSortIndex: number;
	memberId: string;
	memberName: string;
	memberPatrol: string;
	memberAnswer: string;
	answered: boolean;
	awarded: boolean;
}

function inputGroupSort(inputGroup: string): number {
	if (inputGroup === 'Plan>') return 1;
	if (inputGroup === 'Do>') return 2;
	if (inputGroup === 'Review>') return 3;
	return 4;
}

/** A stream's stages from its tree, in tree order */
export function stagesFromTree(streamTitle: string, root: OASTreeNode): OASStage[] {
	const stages: OASStage[] = [];
	const add = (node: OASTreeNode) => {
		stages.push({
			stream: streamTitle,
			branch: node.branch_id,
			stageTitle: node.title,
			stage: node.stage,
			templateLink: node.template_link,
			selectListItemText:
				streamTitle === node.title
					? `${streamTitle} ${node.stage}`
					: `${streamTitle} ${node.title} ${node.stage}`
		});
		for (const child of node.children ?? []) add(child);
	};
	add(root);
	return stages;
}

const shortDate = (value: unknown) => {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '';
	// dd/MM/yy
	const full = dayMonthYear(toCalendarDate(value));
	return full.slice(0, 6) + full.slice(8);
};

// Records still being worked on. Leaders' saves leave a record in_progress, so its verified statements count
const IN_PROGRESS_STATUSES = ['in_progress', 'draft_review', 'feedback_review', 'pending_review'];

/**
 * Who has done which statement of a stage, from the unit's records for it. Each youth gets a row per
 * statement; done statements are marked answered (and awarded, once the stage is).
 */
export function worksheetAnswers(
	templateRows: TemplateRow[],
	records: TerrainAchievement[],
	members: MemberSummary[],
	memberName: (member: MemberSummary) => string,
	hideCompletedMembers = false
): WorksheetAnswer[] {
	const youth = sortBy(
		members.filter((m) => !m.isAdultLeader),
		asc((m) => m.firstName),
		asc((m) => m.lastName)
	);
	let templateTitle = templateRows.length > 0 ? templateRows[0].templateTitle : '';
	if (hideCompletedMembers) templateTitle += ' (in progress)';

	let answers: WorksheetAnswer[] = [];
	for (const item of sortBy(
		templateRows,
		asc((t) => t.inputGroupSort),
		asc((t) => t.id)
	)) {
		for (const member of youth) {
			answers.push({
				templateTitle,
				inputId: item.inputId,
				inputTitle: item.inputGroup.replaceAll('>', ''),
				inputLabel: item.inputLabel,
				inputTitleSortIndex: item.inputGroupSort,
				inputSortIndex: item.id,
				memberId: member.id,
				memberName: memberName(member),
				memberPatrol: member.patrolName,
				memberAnswer: '',
				answered: false,
				awarded: false
			});
		}
	}

	const answerFor = (inputId: string, memberId: string) =>
		answers.find((a) => a.inputId === inputId && a.memberId === memberId);

	for (const record of records) {
		const recordAnswers = Object.entries(record.answers ?? {});
		const verified = recordAnswers.filter(
			([key]) => key.endsWith('_verifiedDate') || key === 'logbook_up_to_date'
		);
		const updated = shortDate(record.status_updated);

		// Being worked on or submitted for review: the verified statements count as done
		if (IN_PROGRESS_STATUSES.includes(record.status)) {
			for (const [key, value] of verified) {
				const answer = answerFor(key.replace('_verifiedDate', ''), record.member_id ?? '');
				if (answer) {
					answer.memberAnswer =
						key === 'logbook_up_to_date' && (value === true || value === 'true')
							? 'Yes'
							: String(value);
					answer.answered = true;
				}
			}
		}

		if (record.status === 'awarded' || record.status === 'approved') {
			if (hideCompletedMembers) {
				answers = answers.filter((a) => a.memberId !== record.member_id);
				continue;
			}
			const own = answers.filter((a) => a.memberId === record.member_id);
			const imported = (record.imported as { date_awarded?: string } | undefined)?.date_awarded;
			if (imported) {
				for (const answer of own) {
					answer.memberAnswer = shortDate(imported);
					answer.answered = true;
					answer.awarded = true;
				}
			}
			// Awarded with no record of which statements: count them all
			if (recordAnswers.length === 0 || verified.length === 0) {
				for (const answer of own) {
					answer.memberAnswer = updated;
					answer.answered = true;
					answer.awarded = true;
				}
			}
			for (const [key] of verified) {
				const answer = answerFor(key.replace('_verifiedDate', ''), record.member_id ?? '');
				if (answer) {
					answer.memberAnswer = updated;
					answer.answered = true;
					answer.awarded = true;
				}
			}
			const logbook = answers.find(
				(a) => a.inputId === 'logbook_up_to_date' && a.memberId === record.member_id && !a.answered
			);
			if (logbook) {
				logbook.memberAnswer = updated;
				logbook.answered = true;
				logbook.awarded = true;
			}
		}
	}

	return sortBy(
		answers,
		asc((a) => a.inputTitleSortIndex),
		asc((a) => a.inputSortIndex)
	);
}

export class OASService {
	private stages: OASStage[] = [];
	private loadingStages: Promise<OASStage[]> | null = null;
	private readonly templates = new Map<string, TemplateRow[]>();

	constructor(private readonly terrain: () => Terrain) {}

	/** Every stage of every stream, loaded once */
	async stageList(): Promise<OASStage[]> {
		if (this.stages.length > 0) return this.stages;
		this.loadingStages ??= (async () => {
			const trees = await Promise.all(OAS_STREAMS.map((stream) => this.terrain().oasTree(stream)));
			this.stages = trees.flatMap((tree) => stagesFromTree(tree.title, tree.tree));
			return this.stages;
		})().finally(() => (this.loadingStages = null));
		return this.loadingStages;
	}

	/** A stage's statements as rows, loaded once. The template name is its link without "/latest.json" */
	async templateRows(templateName: string): Promise<TemplateRow[]> {
		const cached = this.templates.get(templateName);
		if (cached) return cached;
		const template = await this.terrain().oasTemplate(templateName);
		const rows: TemplateRow[] = [];
		let id = 0;
		for (const document of template.document) {
			for (const group of document.input_groups) {
				for (const input of group.inputs.filter((i) => i.id !== 'file_uploader')) {
					rows.push({
						id: id++,
						templateName,
						templateTitle: document.title,
						inputGroup: group.title,
						inputGroupSort: inputGroupSort(group.title),
						inputId: input.id,
						inputLabel: input.label,
						inputDetail: input.dialog_text ?? ''
					});
				}
			}
		}
		const sorted = sortBy(
			rows,
			asc((t) => t.inputGroupSort),
			asc((t) => t.id)
		);
		this.templates.set(templateName, sorted);
		return sorted;
	}

	/** The unit's records for one stage */
	unitRecords(unitId: string, stage: OASStage): Promise<TerrainAchievement[]> {
		return this.terrain().unitOASAchievements(
			unitId,
			stage.stream.toLowerCase(),
			stage.branch,
			stage.stage
		);
	}

	/** Prefers the stream's main branch where a stage has several (e.g. alpine skiing / snowboarding) */
	static findStage(stages: OASStage[], stream: string, stage: number): OASStage | null {
		const matches = stages.filter(
			(s) => s.stream.toLowerCase() === stream.toLowerCase() && s.stage === stage && s.templateLink
		);
		return (
			matches.find((s) => s.branch.toLowerCase() === stream.toLowerCase()) ?? matches[0] ?? null
		);
	}
}
