import { describe, expect, it } from 'vitest';
import { isActive, mainPages, morePages, signedOutPages } from './navigation.js';

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

	it('puts Approvals (leaders only), logging and Logout under More, naming logging by whether it is on', () => {
		expect(morePages(leader).map((p) => p.title)).toEqual([
			'Approvals',
			'Turn on logging',
			'Logout'
		]);
		expect(morePages({ ...leader, logging: true })[1].title).toBe('Stop logging');
		expect(morePages(youth).map((p) => p.title)).toEqual(['Turn on logging', 'Logout']);
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
});
