// Who may verify OAS "I" statements: the minimum adult appointment level for each stream and stage, from
// Scouts Australia's NAAF Appendix 1, "Appointment level for Outdoor Adventure Skills support"
// (https://scouts.com.au/wp-content/uploads/2026/03/NAAF-Appendix-1_Appointment-level-for-Outdoor-Adventure-Skills-support.pdf).
// It applies where two-down support (a youth two stages ahead) isn't available.

import type { OASStage } from './templates.js';

export const NAAF_TITLE = 'NAAF Appendix 1';
export const NAAF_LINK =
	'https://scouts.com.au/wp-content/uploads/2026/03/NAAF-Appendix-1_Appointment-level-for-Outdoor-Adventure-Skills-support.pdf';

/** The appendix's key */
export const NAAF_LEVELS: Record<string, string> = {
	SA: 'Scouting Adventure and Certificate of Proficiency',
	SP: 'Safe Participant',
	TP: 'Trained Participant',
	G: 'Guide',
	'G-DT': 'Guide – Bushwalking – Difficult Tracked Environments',
	'G-AMP': 'Guide – Abseiling – Natural Surfaces: Multi Pitch',
	'G-IA': 'Guide – Canyoning – Intermediate to Advanced',
	'G-CMP': 'Guide – Climbing – Lead: Multi Pitch',
	BWR: 'Skills equivalent to Perform water rescues – SISCAQU020',
	SWR: 'Skills equivalent to Rescue others in white water – SISORSC005',
	'TP-SI': 'Trained Participant – Surfing – Intermediate and Advanced',
	'G-SI': 'Guide – Surfing – Intermediate and Advanced',
	'G-CW': 'Guide – Canoeing – White Water',
	'G-G2': 'Guide – Rafting – Grade 2 Rivers',
	'G-KW': 'Guide – Kayaking – White Water',
	'G-E': 'Guide – Sea Kayaking – Enclosed Waters',
	'G-S': 'Guide – Sea Kayaking – Sheltered Waters'
};

/** The level every leader has: anything else is "more than SA" */
export const BASE_LEVEL = 'SA';

// Stages 1 to 3 of each stream
const STREAMS: Record<string, string[]> = {
	bushcraft: ['SA', 'SA', 'SA'],
	bushwalking: ['SA', 'SA', 'SA', 'SA', 'SA', 'TP', 'G-DT', 'G-DT', 'G-DT'],
	camping: ['SA', 'SA', 'SA', 'SA', 'SA', 'SA', 'SA', 'SA', 'SA'],
	alpine: ['SA', 'SA', 'SA'],
	cycling: ['SA', 'SA', 'SA'],
	vertical: ['SA', 'SA', 'SP'],
	aquatics: ['SA', 'SA', 'SA'],
	boating: ['SA', 'SP', 'TP'],
	paddling: ['SA', 'SP', 'TP']
};

// Stages 4 to 9 of each branch. Where the appendix names a new branch from Stage 7 (e.g. Life Saving
// leads to Swift Water Rescue), both names are listed with the stages they cover
const BRANCHES: Record<string, (string | null)[]> = {
	pioneering: ['SA', 'SA', 'SA', 'G', 'G', 'G'],
	'survival-skills': ['SA', 'SA', 'SP', 'TP', 'TP', 'G'],
	'cross-country-skiing': ['TP', 'TP', 'G', 'G', 'G', 'G'],
	'downhill-skiing': ['TP', 'TP', 'G', 'G', 'G', 'G'],
	'snow-camping-and-hiking': ['TP', 'G', 'G', 'G', 'G', 'G'],
	snowboarding: ['TP', 'TP', 'G', 'G', 'G', 'G'],
	'cycle-touring': ['TP', 'TP', 'TP', 'G', 'G', 'G'],
	'mountain-biking': ['TP', 'TP', 'TP', 'G', 'G', 'G'],
	abseiling: ['TP', 'TP', 'G', 'G', 'G-AMP', 'G-AMP'],
	canyoning: ['TP', 'TP', 'G', 'G', 'G-IA', 'G-IA'],
	caving: ['TP', 'TP', 'G', 'G', 'G', 'G'],
	climbing: ['TP', 'TP', 'G', 'G', 'G-CMP', 'G-CMP'],
	'life-saving': ['BWR', 'BWR', 'BWR', 'BWR', 'SWR', 'SWR'],
	'swift-water-rescue': [null, null, null, 'BWR', 'SWR', 'SWR'],
	snorkelling: ['SP', 'SP', 'TP', 'G', 'G', 'G'],
	scuba: [null, null, null, 'G', 'G', 'G'],
	surfing: ['TP', 'TP', 'TP', 'TP-SI', 'TP-SI', 'G-SI'],
	sailing: ['TP', 'TP', 'TP', 'G', 'G', 'G'],
	windsurfing: ['SP', 'TP', 'TP', 'TP', 'G', 'G'],
	canoeing: ['TP', 'TP', 'G', 'G-CW', 'G-CW', 'G-CW'],
	'white-water-rafting': [null, null, null, 'G-G2', 'G-G2', 'G-G2'],
	kayaking: ['TP', 'TP', 'G', 'G-KW', 'G-KW', 'G-KW'],
	'white-water-kayaking': [null, null, null, 'G-KW', 'G-KW', 'G-KW'],
	'sea-kayaking': ['TP', 'TP', 'G-E', 'G-S', 'G-S', 'G-S']
};

/** "Snow Camping and Hiking" or "snow_camping_and_hiking" → "snow-camping-and-hiking" */
const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/**
 * The level needed to verify a stage's "I" statements, e.g. "TP", or null where the appendix doesn't
 * say (a branch it doesn't list)
 */
export function verifierLevel(stage: Pick<OASStage, 'stream' | 'branch' | 'stageTitle' | 'stage'>) {
	const n = stage.stage;
	if (n < 1 || n > 9) return null;
	const stream = STREAMS[slug(stage.stream)];
	if (stream?.[n - 1]) return stream[n - 1];
	for (const name of [stage.branch, stage.stageTitle]) {
		const level = BRANCHES[slug(name ?? '')]?.[n - 4];
		if (level) return level;
	}
	return null;
}

export interface VerifierRequirement {
	/** e.g. "Paddling Stage 3", or "Vertical Abseiling Stage 8" for a branch */
	title: string;
	/** e.g. "TP" */
	level: string;
	/** e.g. "Trained Participant" */
	levelName: string;
}

const stageName = (stage: Pick<OASStage, 'stream' | 'stageTitle' | 'stage'>) =>
	stage.stageTitle && stage.stageTitle !== stage.stream
		? `${stage.stream} ${stage.stageTitle} Stage ${stage.stage}`
		: `${stage.stream} Stage ${stage.stage}`;

/** What a stage needs of its verifier, when that's more than Scouting Adventure (SA) */
export function aboveBase(
	stage: Pick<OASStage, 'stream' | 'branch' | 'stageTitle' | 'stage'>
): VerifierRequirement | null {
	const level = verifierLevel(stage);
	if (!level || level === BASE_LEVEL) return null;
	return { title: stageName(stage), level, levelName: NAAF_LEVELS[level] ?? level };
}

/** Each of these stages that needs more than SA to verify, once each */
export function requirementsAboveBase(
	stages: readonly Pick<OASStage, 'stream' | 'branch' | 'stageTitle' | 'stage'>[]
): VerifierRequirement[] {
	const seen = new Set<string>();
	return stages
		.map(aboveBase)
		.filter((r): r is VerifierRequirement => r !== null)
		.filter((r) => !seen.has(r.title) && seen.add(r.title));
}

/**
 * The first stage of a stream (in any of its branches) that needs more than SA to verify, e.g. 2 for
 * Paddling, for a note at the top of recording; null when every stage is SA
 */
export function firstStageAboveBase(stages: readonly OASStage[], stream: string): number | null {
	const above = stages
		.filter((s) => s.stream.toLowerCase() === stream.toLowerCase() && aboveBase(s))
		.map((s) => s.stage);
	return above.length > 0 ? Math.min(...above) : null;
}
