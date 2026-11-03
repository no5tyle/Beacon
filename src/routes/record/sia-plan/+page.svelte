<!--
	SIA plan: under construction. Entering a special interest area plan waits on Terrain's plan template
	and its requests for starting a plan and submitting it, so for now the page only says so.
	The plan's model (#lib/model/siaPlan) stays for when it's built.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';

	$effect(() => {
		// Plans are entered by leaders; a youth goes back to Home
		if (app.isYouth) goto(pagePath(''), { replaceState: true });
	});
</script>

<svelte:head>
	<title>Beacon / Plan an SIA</title>
</svelte:head>

<div class="sia-plan">
	<RecordSwitch />
	<h2>Plan an SIA</h2>
	<div class="construction">
		<Icon name="warning" />
		<p class="strong">This page is under construction</p>
		<p class="small muted">
			Entering special interest area plans in Beacon is coming. Until then, plans are entered in
			Terrain; once a youth submits one, it shows on Approvals for the Unit Council.
		</p>
	</div>
</div>

<style>
	.construction {
		padding: 2rem 1rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius-lg);
		text-align: center;
	}

	.construction :global(svg) {
		width: 2rem;
		height: 2rem;
		color: var(--muted);
	}

	.construction p {
		margin: 0.5rem 0 0;
	}
</style>
