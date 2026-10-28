<!--
	Back, as iOS puts it: top left, a chevron and where it goes ("‹ Progress", "‹ Statements"). Used both
	to go back up to a page and back a step in a flow; moving forward stays in the action bar at the bottom.
-->
<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		label,
		href,
		onclick,
		disabled = false
	}: { label: string; href?: string; onclick?: () => void; disabled?: boolean } = $props();
</script>

{#if href}
	<a class="back-link no-print" {href}><Icon name="chevron-left" /> {label}</a>
{:else}
	<button type="button" class="back-link no-print" {disabled} {onclick}
		><Icon name="chevron-left" /> {label}</button
	>
{/if}
