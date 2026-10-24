// Groups OAS requirement wording into skill themes that can be run as a unit night,
// and decides whether a requirement can realistically be ticked off at a regular meeting.

export const PLANNING_THEME = 'Trip Planning';
export const REVIEW_THEME = 'Review & Reflection';
export const OTHER_THEME = 'Other Skills';
export const VERIFY_THEME = 'Logbook';
export const OUTING_THEME = 'Outings & Activities';

interface ThemeDefinition {
	name: string;
	description: string;
	challengeArea: string;
	keywords: string[];
}

const theme = (
	name: string,
	description: string,
	keywords: string[],
	challengeArea = 'Outdoors'
): ThemeDefinition => ({ name, description, challengeArea, keywords });

// First match wins, so more specific themes come first
const THEMES: ThemeDefinition[] = [
	theme('Knots & Lashings', 'Knot tying, lashings and rope work stations', [
		'knot',
		'lashing',
		'rope',
		'hitch',
		'splice',
		'whipping',
		'bowline'
	]),
	theme('Navigation & Maps', 'Map reading, compass bearings and orienteering games', [
		'map',
		'compass',
		'navigat',
		'bearing',
		'grid reference',
		'gps',
		'topograph',
		'orienteer',
		'lost',
		'route card'
	]),
	theme(
		'First Aid & Safety',
		'First aid scenarios, emergency plans and risk management',
		[
			'first aid',
			'injur',
			'bleed',
			'cuts',
			'burn',
			'bite',
			'sting',
			'hypotherm',
			'dehydrat',
			'emergency',
			'safety',
			'safe',
			'risk',
			'buddy'
		],
		'Personal Growth'
	),
	theme('Water Skills', 'Water safety, PFDs and rescue techniques (pool or classroom)', [
		'swim',
		'water safety',
		'paddl',
		'boat',
		'canoe',
		'kayak',
		'life jacket',
		'pfd',
		'rescue',
		'capsiz',
		'throw bag'
	]),
	theme(
		'Cooking & Menus',
		'Menu planning, stove safety and a cook-off',
		['cook', 'menu', 'food', 'meal', 'stove', 'trangia', 'hygiene', 'nutrition', 'ration'],
		'Creative'
	),
	theme('Fire, Tools & Shelter', 'Fire lighting, knife/axe/saw safety and shelter building', [
		'fire',
		'campfire',
		'match',
		'knife',
		'axe',
		'saw',
		'tool',
		'shelter',
		'whittl',
		'tarp',
		'hutchie'
	]),
	theme('Gear & Packing', 'Pack-a-pack challenge, tent pitching and gear care', [
		'pack',
		'gear',
		'equipment',
		'clothing',
		'backpack',
		'tent',
		'sleeping bag',
		'pitch',
		'layers'
	]),
	theme(
		'Weather & Environment',
		'Weather reading, Leave No Trace and local flora/fauna',
		[
			'weather',
			'forecast',
			'environment',
			'leave no trace',
			'minimal impact',
			'etiquette',
			'wildlife',
			'flora',
			'fauna',
			'plants',
			'animals',
			'conservation',
			'rubbish',
			'country',
			'indigenous'
		],
		'Community'
	)
];

/** Phrases that mean the requirement needs an outing, not a unit night */
export const OUTING_PHRASES = [
	'attended',
	'participated in',
	'have been on',
	'have gone on',
	'overnight',
	'day bushwalk',
	'day hike',
	'nights',
	'hours duration',
	'at least two',
	'at least three',
	'at least one',
	'journey',
	'camp for',
	'on a camp',
	'expedition'
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a word in the text starts with the keyword, ignoring case */
function containsWord(text: string, keyword: string): boolean {
	return new RegExp(`\\b${escapeRegExp(keyword)}`, 'i').test(text ?? '');
}

const hasOutingPhrase = (label: string) =>
	OUTING_PHRASES.some((phrase) => (label ?? '').toLowerCase().includes(phrase));

/** The Plan / Do / Review / Verify part of a stage, from Terrain's group title e.g. "Plan>" */
export function normaliseGroup(inputGroup: string): string {
	return (inputGroup ?? '').replaceAll('>', '').trim();
}

export function classify(inputGroup: string, inputLabel: string): string {
	const group = normaliseGroup(inputGroup);
	if (group === 'Verify') return VERIFY_THEME;

	const match = THEMES.find((t) => t.keywords.some((k) => containsWord(inputLabel, k)));
	if (match) return match.name;

	if (group === 'Plan') return PLANNING_THEME;
	if (group === 'Review') return REVIEW_THEME;
	if (hasOutingPhrase(inputLabel)) return OUTING_THEME;
	return OTHER_THEME;
}

export function isUnitNightSuitable(inputGroup: string, inputLabel: string): boolean {
	const group = normaliseGroup(inputGroup);
	if (group === 'Verify') return false;
	// Plan and Review items are discussion based so fit a regular meeting
	if (group === 'Plan' || group === 'Review') return true;
	if (hasOutingPhrase(inputLabel)) return false;
	return classify(inputGroup, inputLabel) !== OTHER_THEME;
}

export function descriptionFor(themeName: string): string {
	const definition = THEMES.find((t) => t.name === themeName);
	if (definition) return definition.description;
	switch (themeName) {
		case PLANNING_THEME:
			return 'Patrols plan an upcoming activity: route, menu, gear list and risk assessment';
		case REVIEW_THEME:
			return 'Patrol presentations and reflections on recent activities';
		default:
			return 'Assorted skills from outstanding OAS requirements';
	}
}

export function challengeAreaFor(themeName: string): string {
	const definition = THEMES.find((t) => t.name === themeName);
	if (definition) return definition.challengeArea;
	return themeName === REVIEW_THEME ? 'Personal Growth' : 'Outdoors';
}
