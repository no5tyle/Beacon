<!--
	SIA plan: under construction. Leaders reach it from Record's switch; youth, whose Record is only this,
	without it. Entering a special interest area plan waits on Terrain's plan template
	and its requests for starting a plan and submitting it, so for now the page only says so.
	The plan's model (#lib/model/siaPlan) stays for when it's built.
-->
<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import RecordSwitch from '#lib/components/RecordSwitch.svelte';
	import { app } from '#lib/services/index.js';
</script>

<svelte:head>
	<title>Beacon / Plan an SIA</title>
</svelte:head>

<div class="sia-plan">
	<!-- Youth record only their SIAs, so there's nothing to switch to -->
	{#if !app.isYouth}<RecordSwitch />{/if}
	<h2>Plan an SIA</h2>
	<div class="construction">
		<Icon name="warning" />
		<p class="strong">This page is under construction</p>
		<p class="small muted">
			{#if app.isYouth}
				Entering your special interest area plans in Beacon is coming. Until then, enter them in
				Terrain.
			{:else}
				Entering special interest area plans in Beacon is coming. Until then, plans are entered in
				Terrain; once a youth submits one, it shows on Approvals for the Unit Council.
			{/if}
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
