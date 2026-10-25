<script lang="ts">
	import InstallHint from '#lib/components/InstallHint.svelte';
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';
</script>

<svelte:head>
	<title>Beacon / Home</title>
</svelte:head>

<InstallHint />

<h2>Welcome {app.memberName}</h2>

<div class="field">
	<label class="form-label" for="group">Group</label>
	<select
		id="group"
		class="form-select"
		value={app.groupId}
		onchange={(e) => app.chooseGroup(e.currentTarget.value)}
	>
		<option value="">Select group</option>
		{#each app.groups as group (group.id)}
			<option value={group.id}>{group.name}</option>
		{/each}
	</select>
	{#if !app.groupId}
		<div class="small hint">Choose the group to work with.</div>
	{/if}
</div>

{#if app.units.length > 1}
	<div class="field">
		<label class="form-label" for="chosenUnit">Unit</label>
		<select
			id="chosenUnit"
			class="form-select"
			value={app.unitId}
			onchange={(e) => app.chooseUnit(e.currentTarget.value)}
		>
			<option value="">Select unit</option>
			{#each app.units as unit (unit.id)}
				<option value={unit.id}>{unit.name}</option>
			{/each}
		</select>
		{#if !app.unitId}
			<div class="small hint">Choose the unit to work with. Every page uses it.</div>
		{/if}
	</div>
{/if}

{#if app.isYouth}
	<p>
		Use Progress to see where you're up to, and Reference to look up any OAS statement and its
		explanation.
	</p>
{:else}
	<p>Use Insights to see the unit's OAS gaps, who is moving up soon and what to programme next.</p>
	<p>
		Use Record OAS to tick off the same OAS statements for several youth at once, e.g. at the end of
		a unit night.
	</p>
	<p>
		Use Personal Progress to see where each youth is up to, record their OAS statements and submit
		stages for review.
	</p>
	<p>Use Reference to look up any OAS statement and its explanation.</p>
{/if}
<p class="small muted">
	Printable reports such as the wallchart, patrol lists and sign in sheets are in the desktop
	<a href="https://nomisnostab.github.io/Topo-Blazor/" target="_blank" rel="noopener">Topo</a> app.
	Having a problem? <a href={pagePath('logging/')}>Turn on logging</a> to help track it down. You can
	also open it any time by tapping the version number.
</p>

<style>
	.field {
		max-width: 26rem;
	}

	.hint {
		margin-top: 0.3rem;
		color: var(--alert-danger-text);
	}
</style>
