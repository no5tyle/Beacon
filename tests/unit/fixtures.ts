// Loads the test fixtures: a made-up unit's progress and OAS worksheet, and Terrain's public OAS templates
import { readFileSync } from 'node:fs';
import { toCalendarDate } from '#lib/model/dates.js';
import type { OASRequirementStatus, YouthRecord } from '#lib/model/insights/models.js';
import { emptyProgress, type YouthProgress } from '#lib/model/insights/progress.js';
import type { OASTemplate, OASTree } from '#lib/model/oas/templates.js';

export function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/** Property names as the C# app's JSON uses them (Newtonsoft's camel case), e.g. "OASBushcraftStage" → "oasBushcraftStage" */
export function camelCase(name: string): string {
	const chars = [...name];
	for (let i = 0; i < chars.length; i++) {
		const isUpper = (c: string) => c !== c.toLowerCase();
		if (i === 1 && !isUpper(chars[i])) break;
		if (i > 0 && i + 1 < chars.length && !isUpper(chars[i + 1])) break;
		chars[i] = chars[i].toLowerCase();
	}
	return chars.join('');
}

/** The made-up unit's wallchart: each youth's progress, as the C# tests load it */
export function loadWallchart(): YouthProgress[] {
	const rows = readJson<Record<string, unknown>[]>('../fixtures/wallchart.json');
	return rows.map((row) => {
		const progress = emptyProgress() as unknown as Record<string, unknown>;
		for (const [key, value] of Object.entries(row)) {
			const field = camelCase(key);
			progress[field] =
				typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
					? toCalendarDate(value)
					: value;
		}
		return progress as unknown as YouthProgress;
	});
}

export function youthFromWallchart(): YouthRecord[] {
	return loadWallchart().map((w) => ({
		memberId: w.memberId,
		memberName: w.memberName,
		patrol: w.memberPatrol,
		dateOfBirth: null,
		progress: w
	}));
}

export interface WorksheetAnswer {
	InputId: string;
	InputTitle: string;
	InputLabel: string;
	MemberId: string;
	MemberName: string;
	MemberPatrol: string;
	Answered: boolean;
}

/** The made-up unit's Bushwalking Stage 3 worksheet: each youth's answer to each statement */
export const loadWorksheet = () => readJson<WorksheetAnswer[]>('../fixtures/oas-worksheet.json');

export const bushwalking3Template = () =>
	readJson<OASTemplate>('../fixtures/oas-bushwalking-3-template.json');
export const alpineTree = () => readJson<OASTree>('../fixtures/oas-alpine-tree.json');

export function worksheetRequirements(answers = loadWorksheet()): OASRequirementStatus[] {
	return answers.map((a) => ({
		stream: 'bushwalking',
		stage: 3,
		inputGroup: a.InputTitle,
		inputLabel: a.InputLabel,
		memberId: a.MemberId,
		answered: a.Answered
	}));
}

/** The worksheet is a Stage 3 Bushwalking one, so give each of its members Stage 2 Bushwalking */
export function bushwalkingStage3Unit(): {
	youth: YouthRecord[];
	requirements: OASRequirementStatus[];
} {
	const answers = loadWorksheet();
	const seen = new Map<string, WorksheetAnswer>();
	for (const a of answers) if (!seen.has(a.MemberId)) seen.set(a.MemberId, a);
	const youth = [...seen.values()].map((a): YouthRecord => ({
		memberId: a.MemberId,
		memberName: a.MemberName,
		patrol: a.MemberPatrol,
		dateOfBirth: null,
		progress: {
			...emptyProgress(a.MemberId),
			oasBushwalkingStage: 2,
			oasBushcraftStage: 1,
			oasCampingStage: 1
		}
	}));
	return { youth, requirements: worksheetRequirements(answers) };
}
