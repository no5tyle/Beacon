import { describe, expect, it } from 'vitest';
import { addMonths, addYears } from '#lib/model/dates.js';
import {
	NO_PATROL,
	sectionBelow,
	sectionFlow,
	upcomingTerms,
	type FlowYouth
} from '#lib/model/insights/sectionFlow.js';
import { defaultInsightsSettings, rulesFor } from '#lib/model/insights/settings.js';

const TODAY = '2026-10-22';
const bornAgo = (years: number, plusMonths = 0) => addMonths(addYears(TODAY, -years), plusMonths);
const settings = defaultInsightsSettings();
const scouts = rulesFor(settings, 'scout');
const cubs = rulesFor(settings, 'cub');
const youth = (id: string, dateOfBirth: string | null, group = ''): FlowYouth => ({
	id,
	name: id,
	dateOfBirth,
	group
});

describe('section flow', () => {
	it('the section below is the one youth move up from', () => {
		expect(sectionBelow('scout')).toBe('cub');
		expect(sectionBelow('cub')).toBe('joey');
		expect(sectionBelow('joey')).toBe('');
		expect(sectionBelow('leaders')).toBe('');
	});

	it('takes terms as quarters of the year, from the current one', () => {
		expect(upcomingTerms(TODAY, 4).map((t) => [t.year, t.term, t.start, t.end])).toEqual([
			[2026, 4, '2026-10-01', '2027-01-01'],
			[2027, 1, '2027-01-01', '2027-04-01'],
			[2027, 2, '2027-04-01', '2027-07-01'],
			[2027, 3, '2027-07-01', '2027-10-01']
		]);
	});

	it('places each move in its term, and works out the size after each', () => {
		const here = [
			youth('ava', bornAgo(15, 2), 'Kookaburra'), // 22 Dec 2026
			youth('ben', bornAgo(16), 'Kookaburra'), // already past 15
			youth('cal', bornAgo(15, 6), 'Wombat'), // 22 Apr 2027
			youth('dee', bornAgo(12), 'Wombat'),
			youth('eve', null)
		];
		const below = [
			youth('oscar', bornAgo(11, 4), 'Cubs'), // 22 Feb 2027
			youth('ava', bornAgo(15, 2), 'Cubs'), // linking across: already here
			youth('zed', null, 'Cubs'),
			youth('wil', bornAgo(11, 12), 'Cubs') // Oct 2027, after the terms shown
		];
		const flow = sectionFlow(here, scouts, below, cubs, TODAY);

		const [t4, t1, t2, t3] = flow.terms;
		expect(t4.departures.map((m) => [m.id, m.overdue])).toEqual([
			['ben', true],
			['ava', false]
		]);
		expect(t4.arrivals).toEqual([]);
		expect(t1.arrivals.map((m) => m.id)).toEqual(['oscar']);
		expect(t2.departures.map((m) => m.id)).toEqual(['cal']);
		expect(flow.terms.map((t) => t.sizeAfter)).toEqual([3, 4, 3, 3]);
		expect(t3.arrivals).toEqual([]);

		expect(flow).toMatchObject({ current: 5, unknownHere: 1, unknownBelow: 1, alreadyHere: 1 });
	});

	it('lists the patrols left smallest first, for placing youth coming in', () => {
		const here = [
			youth('ava', bornAgo(15, 2), 'Kookaburra'),
			youth('ben', bornAgo(16), 'Kookaburra'),
			youth('liz', bornAgo(13), 'Kookaburra'),
			youth('cal', bornAgo(15, 6), 'Wombat'),
			youth('dee', bornAgo(12), 'Wombat'),
			youth('fay', bornAgo(12), 'Possum'),
			youth('eve', bornAgo(12))
		];
		const flow = sectionFlow(here, scouts, [], null, TODAY);
		expect(flow.patrols.map((p) => [p.patrol, p.now, p.leaving.length, p.after])).toEqual([
			['Kookaburra', 3, 2, 1],
			['Wombat', 2, 1, 1],
			['Possum', 1, 0, 1],
			[NO_PATROL, 1, 0, 1]
		]);
		expect(flow.patrols[0].leaving.map((m) => m.id)).toEqual(['ben', 'ava']);
	});

	it('without the section below, only youth moving up out count', () => {
		const flow = sectionFlow(
			[youth('ava', bornAgo(15, 2))],
			scouts,
			[youth('x', bornAgo(11))],
			null,
			TODAY
		);
		expect(flow.terms.flatMap((t) => t.arrivals)).toEqual([]);
		expect(flow.unknownBelow).toBe(0);
	});
});
