// Special interest area plans: a youth's projects, starting and saving a plan, and submitting it for the
// Unit Council's approval. Terrain takes these only from the youth's own profile, so writes are sent as
// the youth, as Record OAS does; a youth signed in acts as themselves.

import { terrainReason } from '#lib/model/oas/milestoneReview.js';
import {
	createPlanBody,
	isPlanEditable,
	planAnswers,
	SIA_TYPE,
	submitPlanBody,
	updatePlanBody,
	type SIAAnswers,
	type SIARecord,
	type SIATemplate
} from '#lib/model/siaPlan.js';
import type { TerrainWriteResult } from '#lib/terrain/errors.js';
import type { BeaconContext } from './context.js';
import type { UnitProgressService } from './unitProgress.js';

export type SIAOutcome = { ok: true; record: SIARecord } | { ok: false; message: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What went wrong, in the words the Record pages use, with Terrain's own reason where it gave one */
function failureMessage(action: string, result: TerrainWriteResult): string {
	if (result.status === 0) return result.body || `Couldn't ${action}.`;
	const reason = terrainReason(result.body);
	return `Terrain didn't accept ${action} (response ${result.status})${reason ? `: ${reason}` : '.'}`;
}

export class SIAService {
	private readonly templates = new Map<string, Promise<SIATemplate>>();

	constructor(
		private readonly context: BeaconContext,
		private readonly unitProgress: UnitProgressService
	) {}

	/** The section's plan template, e.g. sia/cub/plan, read once */
	planTemplate(section: string): Promise<SIATemplate> {
		let template = this.templates.get(section);
		if (!template) {
			template = this.context.terrain.siaTemplate(section, 'plan') as Promise<SIATemplate>;
			template.catch(() => this.templates.delete(section));
			this.templates.set(section, template);
		}
		return template;
	}

	/** A youth's SIA projects, newest first */
	async projects(memberId: string): Promise<SIARecord[]> {
		const list = (await this.context.terrain.memberAchievements(
			memberId,
			SIA_TYPE
		)) as unknown as SIARecord[];
		const time = (r: SIARecord) =>
			Date.parse(String(r.last_updated ?? r.status_updated ?? '')) || 0;
		return [...list].sort((a, b) => time(b) - time(a));
	}

	/**
	 * Saves the plan: starts a new one when there's no record yet, otherwise saves to the record, read
	 * fresh first so a change made in Terrain since isn't overwritten. Returns the record as saved
	 */
	async savePlan(
		memberId: string,
		section: string,
		template: SIATemplate,
		record: SIARecord | null,
		answers: SIAAnswers
	): Promise<SIAOutcome> {
		try {
			const outcome = await this.context.terrain.actAsYouth(memberId, async (youth) => {
				if (!record) {
					const body = createPlanBody(template, section, planAnswers({}, answers));
					const result = await youth.createAchievement(memberId, body);
					if (!result.success)
						return { ok: false, message: failureMessage('the new plan', result) } as const;
					return { ok: true, created: result.body } as const;
				}
				const latest = (
					(await youth.memberAchievements(memberId, SIA_TYPE)) as unknown as SIARecord[]
				).find((r) => r.id === record.id);
				if (!latest)
					return { ok: false, message: "Couldn't find this plan in Terrain any more." } as const;
				if (String(latest.last_updated ?? '') !== String(record.last_updated ?? ''))
					return {
						ok: false,
						message:
							'This plan has changed in Terrain since you opened it. Open it again and retry.'
					} as const;
				if (!isPlanEditable(latest))
					return {
						ok: false,
						message: "This plan has been submitted, so it can't be changed here."
					} as const;
				const result = await youth.updateAchievement(
					memberId,
					record.id,
					updatePlanBody(latest, planAnswers(latest.answers, answers))
				);
				if (!result.success)
					return { ok: false, message: failureMessage('the plan', result) } as const;
				return { ok: true, created: result.body } as const;
			});
			if (!outcome.acted)
				return {
					ok: false,
					message: `Terrain wouldn't let Beacon act as this youth, so nothing was saved. ${failureMessage('the switch', outcome.result)}`
				};
			const value = outcome.value;
			if (!value.ok) return value;
			this.unitProgress.clear(this.context.unitId);
			// The saved record, from Terrain's answer, or found again among the youth's projects
			const saved =
				this.parseRecord(value.created) ?? (await this.findSaved(memberId, record, answers));
			return saved
				? { ok: true, record: saved }
				: { ok: false, message: 'Saved, but Beacon couldn’t read the plan back. Open it again.' };
		} catch (error) {
			return { ok: false, message: errorText(error) };
		}
	}

	/** Submits a saved plan for the Unit Council's approval, on the youth's behalf, in the chosen unit */
	async submitPlan(
		memberId: string,
		record: SIARecord,
		unitId = this.context.unitId
	): Promise<SIAOutcome> {
		try {
			const outcome = await this.context.terrain.actAsYouth(memberId, (youth) =>
				youth.submitOnBehalf(memberId, record.id, submitPlanBody(unitId, this.submitterId(unitId)))
			);
			if (!outcome.acted)
				return {
					ok: false,
					message: `Terrain wouldn't let Beacon act as this youth, so nothing was submitted. ${failureMessage('the switch', outcome.result)}`
				};
			if (!outcome.value.success)
				return { ok: false, message: failureMessage('the submission', outcome.value) };
			this.unitProgress.clear(unitId);
			const latest = (await this.projects(memberId)).find((r) => r.id === record.id);
			return { ok: true, record: latest ?? { ...record, status: 'pending_approval' } };
		} catch (error) {
			return { ok: false, message: errorText(error) };
		}
	}

	/** The signed in member, recorded by Terrain as who submitted it: their profile in the unit */
	private submitterId(unitId: string): string {
		const profiles = this.context.profiles?.profiles ?? [];
		return (profiles.find((p) => p.unit?.id === unitId) ?? profiles[0])?.member.id ?? '';
	}

	private parseRecord(body: string): SIARecord | null {
		try {
			const parsed = JSON.parse(body) as SIARecord;
			return parsed && typeof parsed.id === 'string' && parsed.id ? parsed : null;
		} catch {
			return null;
		}
	}

	/** After a save Terrain answered without the record: the plan just saved, among the youth's projects */
	private async findSaved(
		memberId: string,
		record: SIARecord | null,
		answers: SIAAnswers
	): Promise<SIARecord | null> {
		const projects = await this.projects(memberId);
		if (record) return projects.find((r) => r.id === record.id) ?? null;
		const name = answers.project_name?.trim();
		return projects.find((r) => isPlanEditable(r) && r.answers?.project_name === name) ?? null;
	}
}
