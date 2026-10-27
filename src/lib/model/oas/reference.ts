// A browsable reference of every OAS I statement, built from Terrain's public templates.
// Nothing here relates to any youth member. Ported from Beacon's C# OASReference.

import { STREAMS } from '../insights/insightsCalculator.js';
import { classify, isUnitNightSuitable } from '../insights/skillThemes.js';
import { asc, containsIgnoreCase, groupBy, sortBy } from '../util.js';
import type { OASTemplate, OASTree, OASTreeNode } from './templates.js';

export const VERIFIABLE_CHECKBOX = 'verifiable_checkbox';
export const PARTS = ['Plan', 'Do', 'Review'];

export interface OASReferenceStage {
	stream: string;
	streamTitle: string;
	branch: string;
	/** Empty for stages that aren't on a separate branch */
	branchTitle: string;
	stage: number;
	templateLink: string;
}

/** The template link without its folder and file, e.g. "alpine/snowboarding/5" */
export const stagePath = (stage: OASReferenceStage) =>
	stage.templateLink.replaceAll('oas/', '').replaceAll('/latest.json', '');

export const stageTitle = (stage: OASReferenceStage) =>
	stage.branchTitle
		? `${stage.streamTitle} · ${stage.branchTitle} Stage ${stage.stage}`
		: `${stage.streamTitle} Stage ${stage.stage}`;

export interface OASReferenceStatement {
	stage: OASReferenceStage;
	order: number;
	inputId: string;
	part: string;
	label: string;
	detail: string;
	theme: string;
	unitNightSuitable: boolean;
}

/**
 * Stable across sessions, so a statement can be starred or shared,
 * e.g. "bushwalking/3:help_plan_bushwalking_balanced_menu_542939"
 */
export const statementKey = (statement: OASReferenceStatement) =>
	`${stagePath(statement.stage)}:${statement.inputId}`;

export type OASReferenceWhere = 'Any' | 'UnitNight' | 'Outing';
const WHERE_VALUES: OASReferenceWhere[] = ['Any', 'UnitNight', 'Outing'];

export interface OASReferenceFilter {
	/** When set, only these statements, e.g. the starred list */
	keys?: ReadonlySet<string> | null;
	streams?: ReadonlySet<string>;
	/** Empty means every stage */
	stages?: ReadonlySet<number>;
	part?: string;
	theme?: string;
	where?: OASReferenceWhere;
	search?: string;
}

/** Every stage in a stream's tree, including each branch of the higher stages */
export function referenceStages(tree: OASTree): OASReferenceStage[] {
	const stages: OASReferenceStage[] = [];
	const add = (node: OASTreeNode) => {
		if (node.template_link) {
			stages.push({
				stream: tree.stream_id,
				streamTitle: tree.title,
				branch: node.branch_id,
				branchTitle: node.title === tree.title ? '' : node.title,
				stage: node.stage,
				templateLink: node.template_link
			});
		}
		for (const child of node.children ?? []) add(child);
	};
	add(tree.tree);
	const unique = groupBy(stages, (s) => s.templateLink).map((g) => g.items[0]);
	return sortBy(
		unique,
		asc((s) => s.stage),
		asc((s) => s.branchTitle)
	);
}

export function referenceStatements(
	stage: OASReferenceStage,
	template: OASTemplate
): OASReferenceStatement[] {
	const result: OASReferenceStatement[] = [];
	let order = 0;
	for (const document of template.document) {
		for (const group of document.input_groups) {
			const part = group.title.replaceAll('>', '').trim();
			for (const input of group.inputs.filter((i) => i.type === VERIFIABLE_CHECKBOX)) {
				const label = input.label ?? '';
				result.push({
					stage,
					order: order++,
					inputId: input.id ?? '',
					part,
					label,
					detail: (input.dialog_text ?? '').trim(),
					theme: classify(part, label),
					unitNightSuitable: isUnitNightSuitable(part, label)
				});
			}
		}
	}
	return result;
}

export function filterStatements(
	list: readonly OASReferenceStatement[],
	filter: OASReferenceFilter
): OASReferenceStatement[] {
	const words = (filter.search ?? '')
		.split(' ')
		.map((w) => w.trim())
		.filter((w) => w !== '');
	const streams = filter.streams ?? new Set<string>();
	const stages = filter.stages ?? new Set<number>();
	const where = filter.where ?? 'Any';
	const matching = list
		.filter((s) => !filter.keys || filter.keys.has(statementKey(s)))
		.filter((s) => streams.size === 0 || streams.has(s.stage.stream))
		.filter((s) => stages.size === 0 || stages.has(s.stage.stage))
		.filter((s) => !filter.part || s.part === filter.part)
		.filter((s) => !filter.theme || s.theme === filter.theme)
		.filter(
			(s) =>
				where === 'Any' ||
				(where === 'UnitNight' && s.unitNightSuitable) ||
				(where === 'Outing' && !s.unitNightSuitable)
		)
		.filter((s) =>
			words.every(
				(w) =>
					containsIgnoreCase(s.label, w) ||
					containsIgnoreCase(s.detail, w) ||
					containsIgnoreCase(stageTitle(s.stage), w)
			)
		);
	return sortBy(
		matching,
		asc((s) => STREAMS.findIndex((x) => x.key === s.stage.stream)),
		asc((s) => s.stage.stage),
		asc((s) => s.stage.branchTitle),
		asc((s) => s.order)
	);
}

/** The stream a statement key belongs to, e.g. "alpine" from "alpine/snowboarding/5:id" */
export const streamOfKey = (key: string) => key.split(/[/:]/)[0];

/** Plain text checklist for sharing, grouped by stage in the order given */
export function checklistText(list: readonly OASReferenceStatement[], heading: string): string {
	let text = heading;
	for (const { key, items } of groupBy(list, (s) => stageTitle(s.stage))) {
		text += `\n\n${key}`;
		for (const statement of items) text += `\n☐ ${statement.label}`;
	}
	return text;
}

/** The reference's filters as a link, so a view or a single statement can be shared */
export interface OASReferenceLink {
	stream: string;
	stages: number[];
	part: string;
	theme: string;
	where: OASReferenceWhere;
	search: string;
	statement: string;
	starred: boolean;
	/** A list of statements shared from someone's starred list, by key */
	list: string[];
}

export function emptyReferenceLink(): OASReferenceLink {
	return {
		stream: '',
		stages: [],
		part: '',
		theme: '',
		where: 'Any',
		search: '',
		statement: '',
		starred: false,
		list: []
	};
}

/** Escapes like .NET's Uri.EscapeDataString, which also escapes ! ' ( ) * */
function escapeDataString(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
	);
}

/** Unescapes like .NET's Uri.UnescapeDataString, leaving anything that isn't a valid escape as it is */
function unescapeDataString(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value.replace(/(%[0-9A-Fa-f]{2})+/g, (run) => {
			try {
				return decodeURIComponent(run);
			} catch {
				return run;
			}
		});
	}
}

/** Like .NET's int.TryParse: whole numbers with optional sign and surrounding spaces, else 0 */
function parseWholeNumber(text: string): number {
	return /^\s*[+-]?\d+\s*$/.test(text) ? Number(text) : 0;
}

/**
 * A list of statements, short enough for a link: grouped by stage, each stage's statements after a colon
 * and separated by dots, stages separated by "~", e.g. "bushwalking/3:plan_menu.pack_gear~camping/1:knots"
 */
export function encodeStatementList(keys: readonly string[]): string {
	return groupBy(
		keys.filter((k) => k.includes(':')),
		(k) => k.slice(0, k.indexOf(':'))
	)
		.map((g) => `${g.key}:${g.items.map((k) => k.slice(k.indexOf(':') + 1)).join('.')}`)
		.join('~');
}

export function decodeStatementList(value: string): string[] {
	return value.split('~').flatMap((group) => {
		const split = group.indexOf(':');
		if (split <= 0) return [];
		const stage = group.slice(0, split);
		return group
			.slice(split + 1)
			.split('.')
			.filter(Boolean)
			.map((id) => `${stage}:${id}`);
	});
}

export function referenceLinkToQuery(link: OASReferenceLink): string {
	const parts: string[] = [];
	const add = (name: string, value: string) => {
		if (value) parts.push(`${name}=${escapeDataString(value)}`);
	};
	add('s', link.statement);
	add('stream', link.stream);
	add('stage', [...link.stages].sort((a, b) => a - b).join(','));
	add('part', link.part);
	add('theme', link.theme);
	add('where', link.where === 'Any' ? '' : link.where);
	add('q', link.search);
	add('view', link.starred ? 'starred' : '');
	add('list', encodeStatementList(link.list));
	return parts.length > 0 ? '?' + parts.join('&') : '';
}

export function parseReferenceLink(query: string): OASReferenceLink {
	const link = emptyReferenceLink();
	const pairs = (query ?? '')
		.replace(/^\?+/, '')
		.split('&')
		.filter((p) => p !== '');
	for (const pair of pairs) {
		const split = pair.indexOf('=');
		const name = split < 0 ? pair : pair.slice(0, split);
		const value = split < 0 ? '' : unescapeDataString(pair.slice(split + 1).replaceAll('+', ' '));
		switch (name) {
			case 's':
				link.statement = value;
				break;
			case 'stream':
				link.stream = value;
				break;
			case 'stage':
				link.stages = [
					...new Set(
						value
							.split(',')
							.map(parseWholeNumber)
							.filter((n) => n > 0)
					)
				];
				break;
			case 'part':
				link.part = value;
				break;
			case 'theme':
				link.theme = value;
				break;
			case 'where':
				link.where = WHERE_VALUES.includes(value as OASReferenceWhere)
					? (value as OASReferenceWhere)
					: 'Any';
				break;
			case 'q':
				link.search = value;
				break;
			case 'view':
				link.starred = value === 'starred';
				break;
			case 'list':
				link.list = decodeStatementList(value);
				break;
		}
	}
	return link;
}
