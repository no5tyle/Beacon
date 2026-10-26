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
			'Home',
			'Insights',
			'Record',
			'Progress',
			'Reference'
		]);
	});

	it('gives youth only Home, Progress and Reference', () => {
		expect(mainPages(youth).map((p) => p.shortTitle)).toEqual(['Home', 'Progress', 'Reference']);
	});

	it('puts Approvals (leaders only) and Logout under More, with logging left to the version', () => {
		expect(morePages(leader).map((p) => p.title)).toEqual(['Approvals', 'Logout']);
		expect(morePages({ ...leader, logging: true }).map((p) => p.title)).toEqual([
			'Approvals',
			'Logout'
		]);
		expect(morePages(youth).map((p) => p.title)).toEqual(['Logout']);
	});

	it('shows how many approvals wait for the leader on Approvals, and in total on More', () => {
		const pages = morePages({ ...leader, approvalsWaiting: 3 });
		expect(pages.find((p) => p.title === 'Approvals')?.badge).toBe(3);
		expect(moreBadge(pages)).toBe(3);
		expect(moreBadge(morePages(leader))).toBe(0);
	});

	it('offers only Login and the Reference when signed out', () => {
		expect(signedOutPages().map((p) => p.title)).toEqual(['Login', 'Reference']);
	});

	it('marks Home active only on the home page', () => {
		const home = mainPages(leader)[0];
		expect(isActive(home, '/')).toBe(true);
		expect(isActive(home, '/insights/')).toBe(false);
	});

	it('marks a page active on its own address and anything under it', () => {
		const progress = mainPages(leader).find((p) => p.shortTitle === 'Progress')!;
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
				main: ['Home', 'Insights', 'Record', 'Reference'],
				more: ['Progress', 'Approvals', 'Logout']
			});
		});

		it('swap the open page from More into the bar, and Reference into More', () => {
			expect(titles(phoneTabs(leader, '/progress/m1/'))).toEqual({
				main: ['Home', 'Insights', 'Record', 'Progress'],
				more: ['Reference', 'Approvals', 'Logout']
			});
			expect(titles(phoneTabs(leader, '/approvals/'))).toEqual({
				main: ['Home', 'Insights', 'Record', 'Approvals'],
				more: ['Reference', 'Progress', 'Logout']
			});
		});

		it('keep Progress in the bar for youth, as their main page', () => {
			expect(titles(phoneTabs(youth, '/progress/'))).toEqual({
				main: ['Home', 'Progress', 'Reference'],
				more: ['Logout']
			});
		});

		it('leave the bar as it is on the logging page', () => {
			expect(titles(phoneTabs(leader, '/logging/')).main).toEqual([
				'Home',
				'Insights',
				'Record',
				'Reference'
			]);
		});
	});
});
