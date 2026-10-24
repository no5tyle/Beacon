/**
 * Terrain's "assume profile" switches the whole login to a youth's profile until it is revoked, so any
 * other request sent meanwhile would be answered as that youth. Requests normally run side by side,
 * but a span acting as a youth waits for them to finish and holds new ones back until it is done.
 * This matters once loading runs in the background while a leader uses another page.
 *
 * Requests made by the span itself don't go through the gate: the span is given its own client for them.
 */
export class ProfileGate {
	private inFlight = 0;
	private idleWaiters: (() => void)[] = [];
	/** Settles when the current acting-as-youth span ends; null when none is running */
	private exclusive: Promise<void> | null = null;
	/** Acting-as-youth spans run one at a time, in the order asked for */
	private spans: Promise<void> = Promise.resolve();

	/** Runs one request to Terrain, waiting first if Beacon is acting as a youth */
	async request<T>(send: () => Promise<T>): Promise<T> {
		while (this.exclusive) await this.exclusive;
		this.inFlight++;
		try {
			return await send();
		} finally {
			this.inFlight--;
			if (this.inFlight === 0) {
				const waiters = this.idleWaiters;
				this.idleWaiters = [];
				waiters.forEach((resolve) => resolve());
			}
		}
	}

	/** Runs everything from assuming a youth's profile to revoking it, with nothing else reaching Terrain */
	async actAsYouth<T>(span: () => Promise<T>): Promise<T> {
		const previous = this.spans;
		let spanDone!: () => void;
		this.spans = new Promise((resolve) => (spanDone = resolve));
		await previous;

		let release!: () => void;
		this.exclusive = new Promise((resolve) => (release = resolve));
		try {
			if (this.inFlight > 0) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
			return await span();
		} finally {
			this.exclusive = null;
			release();
			spanDone();
		}
	}

	/** Whether Beacon is acting as a youth right now */
	get actingAsYouth(): boolean {
		return this.exclusive !== null;
	}
}
