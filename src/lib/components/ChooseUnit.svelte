<!-- Shown by pages that work on one unit when none is chosen yet -->
<script lang="ts">
	import Icon from './Icon.svelte';
	import { pagePath } from '#lib/paths.js';
</script>

<div class="choose-unit">
	<Icon name="people" />
	<div>
		<strong>Choose a unit first</strong>
		<div class="small">
			You have more than one unit. Pick the one to work with on <a href={pagePath('')}>Home</a>;
			every page then uses it.
		</div>
	</div>
</div>

<style>
	.choose-unit {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		background: var(--surface-2);
	}

	.choose-unit :global(.icon) {
		margin-top: 0.2rem;
		color: var(--brand-text);
	}
</style>
