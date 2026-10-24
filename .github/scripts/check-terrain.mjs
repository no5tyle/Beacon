// Checks Terrain's public OAS template site still has the shape Beacon reads, so a Terrain change is caught
// before a leader finds it at the hall. Fails (and GitHub emails the repo owner) if anything is missing.
const base = 'https://templates.terrain.scouts.com.au/';
const streams = [
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
const problems = [];

async function get(path) {
	const response = await fetch(base + path);
	if (!response.ok) throw new Error(`${path} returned ${response.status}`);
	return response.json();
}

function stages(node, found = []) {
	if (!node) return found;
	if (
		typeof node.stage !== 'number' ||
		typeof node.template_link !== 'string' ||
		!node.template_link
	)
		problems.push(`a ${node.branch_id ?? 'stage'} node has no stage number or template_link`);
	else found.push(node);
	for (const child of node.children ?? []) stages(child, found);
	return found;
}

for (const stream of streams) {
	try {
		const tree = await get(`oas/${stream}/tree.json`);
		if (!tree.title) problems.push(`${stream}: tree has no title`);
		const list = stages(tree.tree);
		if (!list.length) {
			problems.push(`${stream}: tree has no stages`);
			continue;
		}
		// One early stage per stream, the ones leaders record most
		const template = await get(
			list.find((s) => s.stage === 2)?.template_link ?? list[0].template_link
		);
		const inputs = (template.document ?? []).flatMap((d) =>
			(d.input_groups ?? []).flatMap((g) => (g.inputs ?? []).map((i) => ({ ...i, group: g.title })))
		);
		const statements = inputs.filter((i) => i.type === 'verifiable_checkbox');
		if (!template.template || typeof template.version !== 'number')
			problems.push(`${stream}: template has no template or version`);
		if (!statements.length) problems.push(`${stream}: no verifiable_checkbox statements`);
		if (statements.some((i) => !i.id || !i.label))
			problems.push(`${stream}: a statement has no id or label`);
		if (!inputs.some((i) => i.id === 'logbook_up_to_date'))
			problems.push(`${stream}: no logbook_up_to_date input`);
		console.log(
			`${stream}: ${list.length} stages, ${statements.length} statements in stage ${template.meta?.stage}`
		);
	} catch (error) {
		problems.push(`${stream}: ${error.message}`);
	}
}

if (problems.length) {
	console.error(
		'\nTerrain has changed in a way Beacon may not handle:\n- ' + problems.join('\n- ')
	);
	process.exit(1);
}
console.log('\nTerrain templates look as Beacon expects.');
