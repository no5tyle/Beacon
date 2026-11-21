import { describe, expect, it } from 'vitest';
import { missingCoreStages } from '#lib/services/reports.js';

describe('missingCoreStages', () => {
	const stages = (...list: [string, number][]) =>
		list.map(([stream, stage]) => ({ stream, stage }));

	it('lists each core stage up to the one required that has no record', () => {
		expect(
			missingCoreStages(
				stages(
					['bushcraft', 1],
					['bushcraft', 2],
					['bushwalking', 1],
					['camping', 1],
					['camping', 2]
				),
				3
			)
		).toEqual([
			{ stream: 'bushcraft', stage: 3 },
			{ stream: 'bushwalking', stage: 2 },
			{ stream: 'bushwalking', stage: 3 },
			{ stream: 'camping', stage: 3 }
		]);
	});

	it('includes a stage below one completed, and ignores non-core streams and higher stages', () => {
		expect(
			missingCoreStages(
				stages(
					['bushcraft', 1],
					['bushcraft', 3],
					['bushwalking', 1],
					['bushwalking', 2],
					['camping', 1],
					['camping', 2],
					['camping', 6],
					['cycling', 1]
				),
				2
			)
		).toEqual([{ stream: 'bushcraft', stage: 2 }]);
	});

	it('needs nothing where the award needs no stage', () => {
		expect(missingCoreStages([], 0)).toEqual([]);
	});
});
