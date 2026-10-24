// Request logging for troubleshooting, turned on from the Logging page. Entries stay in memory until
// downloaded; login requests are logged without their bodies, which hold tokens.

import type { RequestLogEntry } from '#lib/terrain/client.js';

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (time: Date) =>
	`${pad(time.getDate())}/${pad(time.getMonth() + 1)}/${time.getFullYear()} : ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;

class RequestLog {
	enabled = $state(false);
	lines = $state<string[]>([]);

	add(entry: RequestLogEntry, version: string): void {
		if (!this.enabled) return;
		const prefix = `Version: ${version}; Date: ${stamp(entry.time)};`;
		this.lines.push(`${prefix} Request: ${entry.method} ${entry.url}; StatusCode: ${entry.status}`);
		if (entry.error) this.lines.push(`${prefix} Error: ${entry.error}`);
		if (entry.body !== undefined) this.lines.push(`${prefix} Response: ${entry.body}`);
	}

	clear(): void {
		this.lines = [];
	}
}

export const requestLog = new RequestLog();
