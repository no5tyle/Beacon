<!-- Stands in for a page that hasn't been ported from the Blazor app yet -->
<script lang="ts">
	let { title, phase }: { title: string; phase: number } = $props();
</script>

<svelte:head>
	<title>Beacon / {title}</title>
</svelte:head>

<h2>{title}</h2>
<div class="alert alert-info">
	This page is still being rebuilt and arrives in phase {phase} of the
	<a href="https://github.com/no5tyle/beacon-next/blob/main/docs/plan.md">plan</a>. Use
	<a href="https://no5tyle.github.io/Beacon/">Beacon</a> in the meantime.
</div>
