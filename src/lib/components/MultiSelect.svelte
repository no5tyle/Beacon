<!--
	A compact pick-several list: closed, it looks like a select and says what's picked ("Everyone", one
	name, or "3 youth"); open, it lists the options with a tick box each. Nothing picked means everything.
-->
<script lang="ts">
	let {
		id,
		label,
		options,
		selected = $bindable([]),
		allText = 'Everyone',
		noun = 'selected'
	}: {
		id: string;
		label: string;
		options: string[];
		selected?: string[];
		/** Shown when nothing is picked */
		allText?: string;
		/** After the count when several are picked, e.g. "youth" for "3 youth" */
		noun?: string;
	} = $props();

	let open = $state(false);
	let root: HTMLElement | undefined = $state();

	const summary = $derived(
		selected.length === 0
			? allText
			: selected.length === 1
				? selected[0]
				: `${selected.length} ${noun}`
	);

	function toggle(option: string, checked: boolean) {
		selected = checked
			? options.filter((o) => o === option || selected.includes(o))
			: selected.filter((o) => o !== option);
	}

	// Closes when the leader taps elsewhere or presses Escape
	function closeOutside(event: Event) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}
</script>

<svelte:window
	onclick={closeOutside}
	onkeydown={(e) => {
		if (e.key === 'Escape') open = false;
	}}
/>

<div class="multi-select" bind:this={root}>
	<label class="form-label small" for={id}>{label}</label>
	<button
		{id}
		type="button"
		class="form-select multi-select-button"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open = !open)}>{summary}</button
	>
	{#if open}
		<div class="multi-select-list" role="listbox" aria-multiselectable="true" aria-label={label}>
			<label class="multi-select-option">
				<input
					type="checkbox"
					class="form-check-input"
					checked={selected.length === 0}
					onchange={() => (selected = [])}
				/>
				{allText}
			</label>
			{#each options as option (option)}
				<label class="multi-select-option">
					<input
						type="checkbox"
						class="form-check-input"
						checked={selected.includes(option)}
						onchange={(e) => toggle(option, e.currentTarget.checked)}
					/>
					{option}
				</label>
			{/each}
		</div>
	{/if}
</div>

<style>
	.multi-select {
		position: relative;
		max-width: 14rem;
	}

	.multi-select-button {
		overflow: hidden;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.multi-select-list {
		position: absolute;
		z-index: 20;
		left: 0;
		right: 0;
		max-height: 18rem;
		margin-top: 0.25rem;
		padding: 0.25rem 0;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.multi-select-option {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-height: 44px;
		padding: 0 0.75rem;
		cursor: pointer;
	}

	.multi-select-option:hover {
		background: var(--border-soft);
	}
</style>
