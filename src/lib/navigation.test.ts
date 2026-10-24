import { describe, expect, it } from 'vitest';
import { isActive, mainPages, morePages } from './navigation.js';

const leader = { isYouth: false, logging: false };
const youth = { isYouth: true, logging: false };

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

	it('puts logging and Logout under More, naming logging by whether it is on', () => {
		expect(morePages(leader).map((p) => p.title)).toEqual(['Turn on logging', 'Logout']);
		expect(morePages({ ...leader, logging: true })[0].title).toBe('Stop logging');
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
