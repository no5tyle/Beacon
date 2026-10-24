// Shapes of Terrain's OAS templates (templates.terrain.scouts.com.au), as Beacon reads them

export interface OASTemplate {
	template: string;
	meta: { stage: number; stream: string };
	version: number;
	document: OASTemplateDocument[];
}

export interface OASTemplateDocument {
	title: string;
	input_groups: OASInputGroup[];
}

export interface OASInputGroup {
	title: string;
	inputs: OASInput[];
}

export interface OASInput {
	id: string;
	type: string;
	label: string;
	dialog_text?: string;
	alt?: string;
}

/** A stream's tree of stages (oas/{stream}/tree.json) */
export interface OASTree {
	title: string;
	stream_id: string;
	description?: string;
	achievement_type?: string;
	tree: OASTreeNode;
}

export interface OASTreeNode {
	branch_id: string;
	title: string;
	stage: number;
	template_link: string;
	children?: OASTreeNode[];
}

/** One stage of a stream, as Record OAS lists them */
export interface OASStage {
	/** Display name, e.g. "Bushwalking" */
	stream: string;
	stageTitle: string;
	branch: string;
	stage: number;
	templateLink: string;
	selectListItemText: string;
}
