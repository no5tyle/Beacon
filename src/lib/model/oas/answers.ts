/** An OAS record's answers as Terrain stores them: statement ids to true, plus verifier details */
export type Answers = Record<string, unknown>;

/** Whether an answer is ticked. Terrain stores true, but some records have the text "true" */
export function isTrue(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') return value.toLowerCase() === 'true';
	return false;
}

/** An answer as text, e.g. a verifier's name ("" when there's none) */
export function answerText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}
