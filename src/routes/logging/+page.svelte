<!--
	Logging: records Terrain requests and responses in memory to help solve an issue, then downloads them as
	a text file to email. Login requests are logged without their bodies, which hold passwords and tokens.
-->
<script lang="ts">
	import { app } from '#lib/services/index.js';
	import { requestLog } from '#lib/stores/log.svelte.js';

	const canStart = $derived(!requestLog.enabled && requestLog.lines.length === 0);
	const canDownload = $derived(!requestLog.enabled && requestLog.lines.length > 0);

	const pad = (n: number) => String(n).padStart(2, '0');

	function download() {
		const now = new Date();
		const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
		const blob = new Blob([requestLog.lines.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${app.groupName}_${app.unitName}_Dump_${stamp}.txt`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
		requestLog.clear();
	}
</script>

<svelte:head>
	<title>Beacon / Logging</title>
</svelte:head>

<h2>Logging</h2>

<p>Use this page to start capturing logging information to help in solving issues.</p>
<p>
	To capture logs to assist in solving an issue click on the <strong>Start Logging</strong>
	button.<br />
	Navigate to the relevant area and run the report that has the issue. Once complete return back to this
	page.<br />
	Click on the <strong>Stop Logging</strong> button to stop the logging process.<br />
	Click on the <strong>Download Log</strong> button to download the log file.<br />
	Email the file to the address you have been given.
</p>

<div class="button-row">
	<button
		type="button"
		class="btn btn-success"
		disabled={!canStart}
		onclick={() => (requestLog.enabled = true)}>Start Logging</button
	>
	<button
		type="button"
		class="btn btn-danger"
		disabled={!requestLog.enabled}
		onclick={() => (requestLog.enabled = false)}>Stop Logging</button
	>
	<button type="button" class="btn btn-primary" disabled={!canDownload} onclick={download}
		>Download Log</button
	>
</div>

{#if requestLog.enabled || requestLog.lines.length > 0}
	<p class="small muted">
		{requestLog.lines.length} line{requestLog.lines.length === 1 ? '' : 's'} logged{requestLog.enabled
			? ' so far'
			: ''}.
	</p>
{/if}

<style>
	.button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
</style>
