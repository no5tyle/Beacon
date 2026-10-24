// The unit's members, as Progress and Record OAS list them. Ported from Beacon's C# MembersService.

import { today as todayDate, wholeMonthsBetween, type CalendarDate } from '#lib/model/dates.js';
import type { Profiles, UnitMember } from '#lib/terrain/types.js';
import type { BeaconContext } from './context.js';

export interface MemberSummary {
	id: string;
	memberNumber: string;
	firstName: string;
	lastName: string;
	/** e.g. "12y 4m"; "" when Terrain has no birthday */
	age: string;
	dateOfBirth: CalendarDate | null;
	unitCouncil: boolean;
	patrolName: string;
	/** UL, PL, APL, SL or "" */
	patrolDuty: string;
	/** Unit leader first, then patrol leaders, assistants and everyone else */
	patrolOrder: number;
	isAdultLeader: boolean;
	status: string;
}

function patrolDuty(unitDuty: string, patrolDutyName: string): string {
	if (unitDuty === 'adult_leader') return 'SL';
	if (unitDuty === 'unit_leader') return 'UL';
	if (patrolDutyName === 'assistant_patrol_leader') return 'APL';
	if (patrolDutyName === 'patrol_leader') return 'PL';
	return '';
}

function patrolOrder(unitDuty: string, patrolDutyName: string): number {
	if (unitDuty === 'unit_leader') return 0;
	if (patrolDutyName === 'assistant_patrol_leader') return 2;
	if (patrolDutyName === 'patrol_leader') return 1;
	return 3;
}

function birthday(value: string): CalendarDate | null {
	return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : null;
}

function age(dateOfBirth: CalendarDate | null, today: CalendarDate): string {
	if (!dateOfBirth) return '';
	const months = wholeMonthsBetween(dateOfBirth, today);
	return `${Math.trunc(months / 12)}y ${months % 12}m`;
}

export function toMemberSummary(
	member: UnitMember,
	today: CalendarDate = todayDate()
): MemberSummary {
	const dateOfBirth = birthday(member.date_of_birth);
	const unitDuty = member.unit?.duty ?? '';
	const duty = member.patrol?.duty ?? '';
	return {
		id: member.id,
		memberNumber: member.member_number,
		firstName: member.first_name,
		lastName: member.last_name,
		age: age(dateOfBirth, today),
		dateOfBirth,
		unitCouncil: member.unit?.unit_council ?? false,
		patrolName: member.patrol?.name ?? '',
		patrolDuty: patrolDuty(unitDuty, duty),
		patrolOrder: patrolOrder(unitDuty, duty),
		isAdultLeader: unitDuty === 'adult_leader',
		status: member.status
	};
}

/** A youth member logged in sees only themselves, built from their own profile */
export function youthSelf(profiles: Profiles): MemberSummary | null {
	const profile = profiles.profiles[0];
	if (!profile) return null;
	const username = profiles.username.split('-');
	const name = profile.member.name.split(' ');
	return {
		id: profile.member.id,
		memberNumber: username.length > 1 ? username[1] : '',
		firstName: name[0] ?? '',
		// As the Blazor app builds it: the second word, then any third word followed by a space
		lastName: name.length > 1 ? name[1] + (name.length > 2 ? `${name[2]} ` : '') : '',
		age: '',
		dateOfBirth: null,
		unitCouncil: false,
		patrolName: '',
		patrolDuty: '',
		patrolOrder: 3,
		isAdultLeader: false,
		status: ''
	};
}

export class MembersService {
	private readonly cache = new Map<string, MemberSummary[]>();

	constructor(private readonly context: BeaconContext) {}

	/** The unit's members, from Terrain the first time and remembered after that */
	async get(unitId: string): Promise<MemberSummary[]> {
		const cached = this.cache.get(unitId);
		if (cached) return cached;
		if (this.context.isYouth) {
			const self = this.context.profiles ? youthSelf(this.context.profiles) : null;
			return self ? [self] : [];
		}
		const members = (await this.context.terrain.unitMembers(unitId)).map((m) => toMemberSummary(m));
		this.cache.set(unitId, members);
		return members;
	}

	/** Youth only, in name order */
	async youth(unitId: string): Promise<MemberSummary[]> {
		return (await this.get(unitId)).filter((m) => !m.isAdultLeader);
	}

	async member(unitId: string, memberId: string): Promise<MemberSummary | null> {
		return (await this.get(unitId)).find((m) => m.id === memberId) ?? null;
	}

	/** A youth's last name, or just its first letter when last names are hidden */
	lastName(member: MemberSummary | null | undefined): string {
		if (!member?.lastName) return '';
		return this.context.suppressLastName ? member.lastName[0].toUpperCase() : member.lastName;
	}

	displayName(member: MemberSummary): string {
		return `${member.firstName} ${this.lastName(member)}`;
	}

	clear(unitId?: string): void {
		if (unitId === undefined) this.cache.clear();
		else this.cache.delete(unitId);
	}
}
