import { describe, expect, it } from 'vitest';
import {
	aboveBase,
	firstStageAboveBase,
	requirementsAboveBase,
	verifierLevel
} from '#lib/model/oas/naaf.js';
import type { OASStage } from '#lib/model/oas/templates.js';

const stage = (
	stream: string,
	n: number,
	branch = stream.toLowerCase(),
	title = stream
): OASStage => ({
	stream,
	branch,
	stageTitle: title,
	stage: n,
	templateLink: `oas/${branch}/${n}/latest.json`,
	selectListItemText: `${stream} ${n}`
});

describe('NAAF Appendix 1 verifier levels', () => {
	it('reads the core streams, including each Bushcraft branch from Stage 4', () => {
		expect(verifierLevel(stage('Camping', 9))).toBe('SA');
		expect(verifierLevel(stage('Bushwalking', 5))).toBe('SA');
		expect(verifierLevel(stage('Bushwalking', 6))).toBe('TP');
		expect(verifierLevel(stage('Bushwalking', 7))).toBe('G-DT');
		expect(verifierLevel(stage('Bushcraft', 3))).toBe('SA');
		expect(verifierLevel(stage('Bushcraft', 6, 'survival-skills', 'Survival Skills'))).toBe('SP');
		expect(verifierLevel(stage('Bushcraft', 7, 'pioneering', 'Pioneering'))).toBe('G');
	});

	it('reads specialist branches by their id or title, and branches that start at Stage 7', () => {
		expect(verifierLevel(stage('Vertical', 3))).toBe('SP');
		expect(verifierLevel(stage('Paddling', 2))).toBe('SP');
		expect(verifierLevel(stage('Vertical', 8, 'abseiling', 'Abseiling'))).toBe('G-AMP');
		expect(verifierLevel(stage('Alpine', 5, 'x', 'Snow Camping and Hiking'))).toBe('G');
		expect(verifierLevel(stage('Aquatics', 8, 'swift_water_rescue', 'Swift Water Rescue'))).toBe(
			'SWR'
		);
		expect(verifierLevel(stage('Paddling', 6, 'sea-kayaking', 'Sea Kayaking'))).toBe('G-E');
		expect(verifierLevel(stage('Paddling', 7, 'unknown', 'Unknown'))).toBeNull();
	});

	it('names what each stage needs beyond Scouting Adventure, once per stage', () => {
		expect(aboveBase(stage('Camping', 4))).toBeNull();
		expect(
			requirementsAboveBase([
				stage('Bushwalking', 6),
				stage('Camping', 3),
				stage('Vertical', 4, 'climbing', 'Climbing'),
				stage('Bushwalking', 6)
			])
		).toEqual([
			{ title: 'Bushwalking Stage 6', level: 'TP', levelName: 'Trained Participant' },
			{ title: 'Vertical Climbing Stage 4', level: 'TP', levelName: 'Trained Participant' }
		]);
	});

	it('finds the first stage of a stream that needs more than SA, in any branch', () => {
		const stages = [
			stage('Camping', 1),
			stage('Camping', 9),
			stage('Bushcraft', 3),
			stage('Bushcraft', 4, 'pioneering', 'Pioneering'),
			stage('Bushcraft', 6, 'survival-skills', 'Survival Skills'),
			stage('Bushcraft', 7, 'pioneering', 'Pioneering')
		];
		expect(firstStageAboveBase(stages, 'Camping')).toBeNull();
		expect(firstStageAboveBase(stages, 'Bushcraft')).toBe(6);
	});
});
