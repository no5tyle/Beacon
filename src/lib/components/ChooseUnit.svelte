<!-- Shown by pages that work on one unit when none is chosen yet, with the picker right there -->
<script lang="ts">
	import Icon from './Icon.svelte';
	import UnitPicker from './UnitPicker.svelte';
</script>

<div class="choose-unit">
	<Icon name="people" />
	<div class="choose-body">
		<strong>Choose a unit first</strong>
		<div class="small">
			Every page then uses it. Change it any time under More, or in the sidebar on a computer.
		</div>
		<UnitPicker idPrefix="page-" />
	</div>
</div>

<style>
	.choose-unit {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 0.75rem 0.9rem;
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.choose-body {
		display: grid;
		flex: 1;
		gap: 0.5rem;
		max-width: 26rem;
	}

	.choose-unit :global(.icon) {
		margin-top: 0.2rem;
		color: var(--brand-text);
	}
</style>
