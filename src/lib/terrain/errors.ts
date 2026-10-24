/** A request to Terrain that failed: no signal, refused, or an error response */
export class TerrainError extends Error {
	constructor(
		message: string,
		/** HTTP status, or 0 when there was no response */
		readonly status = 0
	) {
		super(message);
		this.name = 'TerrainError';
	}
}

/** Terrain's login has expired and couldn't be renewed, so the leader needs to log in again */
export class SessionExpiredError extends TerrainError {
	constructor() {
		super('Your Terrain login has expired. Log in again to carry on.');
		this.name = 'SessionExpiredError';
	}
}

/**
 * Wording for a request that failed without a response. The browser hides the reason when Terrain
 * turns a request away (Safari says "Load failed", Chrome "Failed to fetch", Firefox "NetworkError").
 */
export function refusedMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	if (/Load failed|Failed to fetch|NetworkError/.test(message))
		return 'Terrain turned the request away without saying why, or there was no signal.';
	return message;
}

/** The answer to a change sent to Terrain */
export interface TerrainWriteResult {
	success: boolean;
	/** HTTP status, or 0 when there was no response */
	status: number;
	body: string;
}
