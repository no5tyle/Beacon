// A special interest area plan as Record's SIA plan builds it. Only the parts Terrain's own requests
// have shown so far: the area and the project name. The rest of the plan's questions come from Terrain's
// plan template once it's been captured. Not sent to Terrain yet.

/** The six areas, as Terrain names them in a plan's special_interest_area_selection */
export const SIA_AREAS = [
	{ id: 'sia_adventure_sport', name: 'Adventure & Sport' },
	{ id: 'sia_art_literature', name: 'Arts & Literature' },
	{ id: 'sia_environment', name: 'Environment' },
	{ id: 'sia_stem_innovation', name: 'STEM & Innovation' },
	{ id: 'sia_growth_development', name: 'Growth & Development' },
	{ id: 'sia_better_world', name: 'Creating a Better World' }
] as const;

export type SIAAreaId = (typeof SIA_AREAS)[number]['id'];

export interface SIAPlanDraft {
	memberId: string;
	area: SIAAreaId | '';
	projectName: string;
}

export const newSIAPlan = (): SIAPlanDraft => ({ memberId: '', area: '', projectName: '' });

export const siaAreaName = (id: string) => SIA_AREAS.find((a) => a.id === id)?.name ?? '';

/** What's missing before the plan could be saved, in the order the form asks for it */
export function siaPlanProblems(draft: SIAPlanDraft): string[] {
	const problems: string[] = [];
	if (!draft.memberId) problems.push('Choose the youth whose plan it is.');
	if (!draft.area) problems.push('Choose the special interest area.');
	if (!draft.projectName.trim()) problems.push('Give the project a name.');
	return problems;
}
