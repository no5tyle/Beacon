import { describe, expect, it } from 'vitest';
import {
	isActive,
	mainPages,
	moreBadge,
	morePages,
	phoneTabs,
	signedOutPages
} from './navigation.js';

const leader = { signedIn: true, isYouth: false, logging: false };
const youth = { signedIn: true, isYouth: true, logging: false };

describe('navigation', () => {
	it('gives leaders every main page, in tab order', () => {
		expect(mainPages(leader).map((p) => p.shortTitle)).toEqual([
			'Insights',
			'Record',
			'Youth',
			'Reference'
		]);
	});

	it('gives youth Record and Progress, then Reference or, on the Unit Council, Approvals', () => {
		const own = { ...youth, memberId: 'm1' };
		expect(mainPages(own).map((p) => p.shortTitle)).toEqual(['Record', 'Progress', 'Reference']);
		expect(mainPages(own).map((p) => p.href)).toEqual([
			'progress/m1/record-oas/',
			'progress/m1/',
			'oas-reference/'
		]);
		expect(mainPages({ ...own, onUnitCouncil: true }).map((p) => p.shortTitle)).toEqual([
			'Record',
			'Progress',
			'Approvals'
		]);
		// Recording isn't their Progress, though it's under it
		const [record, progress] = mainPages(own);
		expect(isActive(record, '/progress/m1/record-oas/')).toBe(true);
		expect(isActive(progress, '/progress/m1/record-oas/')).toBe(false);
		expect(isActive(record, '/record/sia-plan/')).toBe(true);
	});

	it('puts Approvals (leaders), Info, Log an issue and Logout under More, with logging left to the version', () => {
		expect(morePages(leader).map((p) => p.title)).toEqual([
			'Approvals',
			'Info',
			'Log an issue',
			'Logout'
		]);
		expect(morePages({ ...leader, logging: true }).map((p) => p.title)).toEqual([
			'Approvals',
			'Info',
			'Log an issue',
			'Logout'
		]);
		expect(morePages(youth).map((p) => p.title)).toEqual(['Log an issue', 'Logout']);
		expect(morePages({ ...youth, onUnitCouncil: true }).map((p) => p.title)).toEqual([
			'Reference',
			'Log an issue',
			'Logout'
		]);
	});

	it('shows how many approvals wait for the leader on Approvals, and in total on More', () => {
		const pages = morePages({ ...leader, approvalsWaiting: 3 });
		expect(pages.find((p) => p.title === 'Approvals')?.badge).toBe(3);
		expect(moreBadge(pages)).toBe(3);
		expect(moreBadge(morePages(leader))).toBe(0);
	});

	it('links to Beacon’s GitHub issues, opened as another website', () => {
		const issues = morePages(leader).find((p) => p.title === 'Log an issue')!;
		expect(issues).toMatchObject({
			href: 'https://github.com/no5tyle/Beacon/issues',
			external: true
		});
		expect(isActive(issues, '/insights/')).toBe(false);
	});

	it('offers only Login and the Reference when signed out', () => {
		expect(signedOutPages().map((p) => p.title)).toEqual(['Login', 'Reference']);
	});

	it('marks a page active only on exactly its address when it says so', () => {
		const page = { href: '', icon: 'home', title: 'Top', shortTitle: 'Top', exact: true } as const;
		expect(isActive(page, '/')).toBe(true);
		expect(isActive(page, '/insights/')).toBe(false);
	});

	it('marks a page active on its own address and anything under it', () => {
		const progress = mainPages(leader).find((p) => p.shortTitle === 'Youth')!;
		expect(isActive(progress, '/progress/')).toBe(true);
		expect(isActive(progress, '/progress/m1/record-oas')).toBe(true);
		expect(isActive(progress, '/oas/sign-off/')).toBe(false);
	});

	describe('phone tabs', () => {
		const titles = ({ main, more }: ReturnType<typeof phoneTabs>) => ({
			main: main.map((p) => p.shortTitle),
			more: more.map((p) => p.title)
		});

		it('put Progress under More for leaders, to keep the tab bar roomy', () => {
			expect(titles(phoneTabs(leader, '/insights/'))).toEqual({
				main: ['Insights', 'Record', 'Reference'],
				more: ['Youth', 'Approvals', 'Info', 'Log an issue', 'Logout']
			});
		});

		it('swap the open page from More into the bar, and Reference into More', () => {
			expect(titles(phoneTabs(leader, '/progress/m1/'))).toEqual({
				main: ['Insights', 'Record', 'Youth'],
				more: ['Reference', 'Approvals', 'Info', 'Log an issue', 'Logout']
			});
			expect(titles(phoneTabs(leader, '/approvals/'))).toEqual({
				main: ['Insights', 'Record', 'Approvals'],
				more: ['Reference', 'Youth', 'Info', 'Log an issue', 'Logout']
			});
		});

		it('give youth Record, Progress and Reference in the bar, or Approvals on the Unit Council', () => {
			expect(titles(phoneTabs(youth, '/progress/'))).toEqual({
				main: ['Record', 'Progress', 'Reference'],
				more: ['Log an issue', 'Logout']
			});
			expect(titles(phoneTabs({ ...youth, onUnitCouncil: true }, '/oas-reference/'))).toEqual({
				main: ['Record', 'Progress', 'Approvals'],
				more: ['Reference', 'Log an issue', 'Logout']
			});
		});

		it('leave the bar as it is on the logging page', () => {
			expect(titles(phoneTabs(leader, '/logging/')).main).toEqual([
				'Insights',
				'Record',
				'Reference'
			]);
		});
	});
});
