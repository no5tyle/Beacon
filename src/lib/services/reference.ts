// Loads OAS statements for the Reference from Terrain's public templates, so it works without logging in.
// Loaded streams are kept for the rest of the session. Ported from Beacon's C# OASReferenceService.

import {
	referenceStages,
	referenceStatements,
	type OASReferenceStatement
} from '#lib/model/oas/reference.js';
import { TEMPLATES_ADDRESS, type Terrain } from '#lib/terrain/client.js';

const PARALLEL_REQUESTS = 6;

export class ReferenceService {
	private readonly byStream = new Map<string, OASReferenceStatement[]>();
	private readonly loadedUrls = new Set<string>();

	constructor(private readonly terrain: () => Terrain) {}

	isLoaded(stream: string): boolean {
		return this.byStream.has(stream);
	}

	get statements(): OASReferenceStatement[] {
		return [...this.byStream.values()].flat();
	}

	/** Every template address loaded so far, so the app can save them for offline use */
	get urls(): string[] {
		return [...this.loadedUrls];
	}

	/** Loads a stream's statements, reporting each batch of stages as it arrives */
	async loadStream(
		stream: string,
		progress?: (done: number, total: number) => void
	): Promise<void> {
		if (this.isLoaded(stream)) return;
		const terrain = this.terrain();
		let tree;
		try {
			tree = await terrain.oasTree(stream);
			this.loadedUrls.add(`${TEMPLATES_ADDRESS}oas/${stream}/tree.json`);
		} catch (error) {
			console.warn(`OAS reference: couldn't load the ${stream} tree`, error);
			return;
		}
		const stages = referenceStages(tree);
		const statements: OASReferenceStatement[] = [];
		let done = 0;
		progress?.(done, stages.length);
		for (let i = 0; i < stages.length; i += PARALLEL_REQUESTS) {
			const batch = stages.slice(i, i + PARALLEL_REQUESTS);
			const templates = await Promise.all(
				batch.map((stage) =>
					terrain.oasTemplate(stage.templateLink).then(
						(template) => {
							this.loadedUrls.add(TEMPLATES_ADDRESS + stage.templateLink);
							return template;
						},
						(error) => {
							console.warn(`OAS reference: couldn't load ${stage.templateLink}`, error);
							return null;
						}
					)
				)
			);
			batch.forEach((stage, index) => {
				const template = templates[index];
				if (template) statements.push(...referenceStatements(stage, template));
			});
			done += batch.length;
			progress?.(done, stages.length);
		}
		this.byStream.set(stream, statements);
	}
}
