<!--
	Style guide: every shared piece of Beacon's stylesheet on one page, to check in light and dark mode
	before pages use them. Not linked from the navigation.
-->
<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { icons, type IconName } from '#lib/icons.js';

	let stream = $state('Bushwalking');
	let tab = $state('gaps');
	let ticked = $state(true);
</script>

<svelte:head>
	<title>Beacon / Style guide</title>
</svelte:head>

<h2>Style guide</h2>
<p class="muted">Beacon's shared styles, in your phone's current light or dark mode.</p>

<h3>Text</h3>
<p>
	Body text with a <a href="#text">link</a>, <span class="muted">muted text</span> and
	<small>small text</small>.
</p>

<h3>Buttons</h3>
<div class="button-row">
	<button class="btn btn-primary">Choose youth</button>
	<button class="btn btn-success">Sign off 4 youth</button>
	<button class="btn btn-outline-primary">Same statements</button>
	<button class="btn btn-outline-secondary">Back</button>
	<button class="btn btn-link">Select all</button>
	<button class="btn btn-outline-secondary icon-btn" aria-label="Refresh"
		><Icon name="reload" /></button
	>
	<button class="btn btn-primary" disabled>Logging in...</button>
</div>

<h3>Chips</h3>
<div class="chip-group">
	{#each ['Bushcraft', 'Bushwalking', 'Camping'] as option (option)}
		<button
			class="btn chip {option === stream ? 'btn-primary' : 'btn-outline-primary'}"
			onclick={() => (stream = option)}>{option}</button
		>
	{/each}
</div>

<h3>Form fields</h3>
<div class="field">
	<label class="form-label" for="branch">Branch</label>
	<select id="branch" class="form-select">
		<option>NSW</option>
		<option>SA</option>
	</select>
</div>
<div class="field">
	<label class="form-label" for="member">Member Number</label>
	<input id="member" class="form-control" inputmode="numeric" placeholder="Member number" />
</div>
<label class="check-row">
	<input type="checkbox" class="form-check-input" bind:checked={ticked} />
	I can explain what to pack for a day hike.
</label>

<h3>Cards and alerts</h3>
<div class="card">
	<strong>Bushwalking Stage 2</strong>
	<div class="small muted">Ava Nguyen, Noah Jones · 3 statements</div>
</div>
<div class="alert alert-success">Saved for 4 youth.</div>
<div class="alert alert-warning">Saved for 3 youth, 1 failed.</div>
<div class="alert alert-danger">Couldn't load the unit's youth from Terrain.</div>
<div class="alert alert-info">Beacon switches to each youth's profile in turn.</div>

<h3>Tabs</h3>
<div class="tabs" role="tablist">
	{#each [['gaps', 'OAS gaps'], ['priority', 'Priority'], ['programme', 'Programming']] as [id, label] (id)}
		<button role="tab" aria-selected={tab === id} onclick={() => (tab = id)}>
			{label}
			{#if id === 'priority'}<span class="badge">4</span>{/if}
		</button>
	{/each}
</div>

<h3>Rows</h3>
<ul class="row-list">
	{#each ['Ava Nguyen', 'Noah Jones'] as name (name)}
		<li>
			<a class="card row-link" href="#rows">
				<span class="grow">{name}<br /><small class="muted">Kookaburra</small></span>
				<Icon name="chevron-right" />
			</a>
		</li>
	{/each}
</ul>

<h3>Icons</h3>
<div class="icons">
	{#each Object.keys(icons) as name (name)}
		<span><Icon name={name as IconName} /> {name}</span>
	{/each}
</div>

<style>
	h3 {
		margin-top: 1.5rem;
	}

	.check-row {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	.grow {
		flex: 1;
	}

	.row-list :global(.icon) {
		color: var(--faint);
	}

	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.5rem;
		font-size: 0.875rem;
	}
</style>
