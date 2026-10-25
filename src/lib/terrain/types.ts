// Shapes of Terrain's responses, as far as Beacon reads them. Terrain has no published API, so these follow
// what its own web app receives; fields Beacon doesn't use are left out.

export const ACHIEVEMENT_TYPES = [
	'milestone',
	'outdoor_adventure_skill',
	'special_interest_area',
	'intro_scouting',
	'intro_section',
	'adventurous_journey',
	'course_reflection',
	'personal_reflection',
	'peak_award'
] as const;

export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

/** Tokens from Terrain's login (AWS Cognito) */
export interface AuthenticationResult {
	AccessToken: string;
	ExpiresIn: number;
	IdToken: string;
	RefreshToken?: string;
	TokenType?: string;
}

export interface UserAttribute {
	Name: string;
	Value: string;
}

export interface TerrainUser {
	Username?: string;
	UserAttributes?: UserAttribute[];
}

export interface ProfileRef {
	id: string;
	name: string;
	roles?: string[];
}

export interface Profile {
	member: ProfileRef;
	unit?: ProfileRef & { section?: string };
	group?: ProfileRef;
	branch?: ProfileRef;
	is_support_group?: boolean;
}

export interface Profiles {
	username: string;
	profiles: Profile[];
}

export interface UnitMember {
	id: string;
	member_number: string;
	first_name: string;
	last_name: string;
	status: string;
	date_of_birth: string;
	unit: { id: string; section: string; duty: string; unit_council: boolean; group_id?: string };
	patrol?: { id: string; name: string; duty: string } | null;
	metadata?: { achievementimport?: string };
}

/** An achievement record: a milestone, OAS stage, SIA project, introduction or peak award part */
export interface TerrainAchievement {
	id: string;
	member_id?: string;
	type: string;
	status: string;
	status_updated?: string;
	section?: string;
	template?: string;
	version?: number;
	last_updated?: string | null;
	achievement_meta?: {
		stream?: string;
		branch?: string;
		stage?: number;
		sia_area?: string;
	} & Record<string, unknown>;
	answers?: Record<string, unknown>;
	[field: string]: unknown;
}

export interface LogbookMetric {
	name: string;
	value: number;
	last_updated?: string;
}

/** One submission in a unit's approvals list (units/{id}/submissions), as Terrain's Approvals tab shows it */
export interface TerrainSubmission {
	achievement: {
		id: string;
		type: string;
		achievement_meta?: { stream?: string; branch?: string; stage?: number; sia_area?: string };
	};
	submission: {
		id: string;
		/** "review" (Unit Council sign off) or "award" */
		type: string;
		date: string;
		/** "pending" while waiting for the Unit Council */
		status: string;
		outcome?: string;
		actioned_by?: {
			member_id: string;
			member_first_name: string;
			member_last_name: string;
			/** e.g. "approved" */
			outcome: string;
			time?: string;
		}[];
	};
	/** Whether the signed in leader may approve it */
	unit_permissions?: { write?: boolean };
	member: { id: string; first_name: string; last_name: string };
	submitted_by?: { id: string; first_name: string; last_name: string };
}

/** What a Unit Council member can say about a submission. Only approving is known so far */
export type AssessmentOutcome = 'approved';
