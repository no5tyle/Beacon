<!--
	The group and unit every page works on: in the More menu on phones, the sidebar on desktop, and on a
	page that needs a unit until one is chosen. Each only shows when there's a choice to make.
-->
<script lang="ts">
	import { app } from '#lib/services/index.js';

	let {
		idPrefix,
		dark = false
	}: {
		/** Several pickers can be on the page at once, so each needs its own ids */
		idPrefix: string;
		/** On the sidebar's dark background */
		dark?: boolean;
	} = $props();

	const showGroup = $derived(app.groups.length > 1 || !app.groupId);
	const showUnit = $derived(app.units.length > 1);
</script>

{#if showGroup || showUnit}
	<div class="unit-picker" class:dark>
		{#if showGroup}
			<label class="picker-label" for="{idPrefix}group">Group</label>
			<select
				id="{idPrefix}group"
				class="form-select"
				value={app.groupId}
				onchange={(e) => app.chooseGroup(e.currentTarget.value)}
			>
				<option value="">Select group</option>
				{#each app.groups as group (group.id)}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>
		{/if}
		{#if showUnit}
			<label class="picker-label" for="{idPrefix}unit">Unit</label>
			<select
				id="{idPrefix}unit"
				class="form-select"
				value={app.unitId}
				onchange={(e) => app.chooseUnit(e.currentTarget.value)}
			>
				<option value="">Select unit</option>
				{#each app.units as unit (unit.id)}
					<option value={unit.id}>{unit.name}</option>
				{/each}
			</select>
		{/if}
	</div>
{/if}

<style>
	.unit-picker {
		display: grid;
		gap: 0.3rem;
	}

	.picker-label {
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.picker-label:not(:first-child) {
		margin-top: 0.35rem;
	}

	.dark .picker-label {
		color: rgba(255, 255, 255, 0.6);
	}
</style>
