<!--
	"Loading youth 3 of 12 from Terrain..." with a bar, while the unit's progress loads one youth at a
	time (for Insights, or in the background). Pages that wait on it show it; it's hidden otherwise.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { unitProgress } from '#lib/services/index.js';

	let { unitId, label = 'Loading youth' }: { unitId: string; label?: string } = $props();

	let progress = $state({ done: 0, total: 0 });
	const read = () => (progress = unitProgress.loadProgress(unitId));

	$effect(() => {
		void unitId;
		read();
	});
	onMount(() => unitProgress.onProgress(read));

	const showing = $derived(progress.total > 0 && progress.done < progress.total);
</script>

{#if showing}
	<div class="youth-load" role="status">
		<div class="small">{label} {progress.done} of {progress.total} from Terrain...</div>
		<div class="bar thin">
			<div style:width="{Math.round((100 * progress.done) / progress.total)}%"></div>
		</div>
	</div>
{/if}

<style>
	.youth-load {
		max-width: 28rem;
		margin-bottom: 1rem;
		color: var(--text-2);
	}

	.bar.thin {
		height: 6px;
		margin-top: 0.25rem;
	}

	.bar.thin > div {
		background: var(--primary);
	}
</style>
