<!--
	Where a leader is in a form of several steps: a bar divided into one segment per step, filled up to
	the current one, and the current step's name underneath. The names are read out for screen readers.
-->
<script lang="ts">
	let { steps, current }: { steps: string[]; current: number } = $props();
</script>

<div class="step-bar">
	<ol aria-label="Steps">
		{#each steps as name, i (name)}
			<li
				class:done={i < current}
				class:current={i === current}
				aria-current={i === current ? 'step' : undefined}
			>
				<span class="visually-hidden">{name}</span>
			</li>
		{/each}
	</ol>
	<div class="small step-caption">
		<strong>{steps[current]}</strong>
		<span class="muted">· {current + 1} of {steps.length}</span>
	</div>
</div>

<style>
	.step-bar {
		margin: 0 0 1rem;
	}

	ol {
		display: flex;
		gap: 4px;
		margin: 0 0 0.35rem;
		padding: 0;
		list-style: none;
	}

	li {
		flex: 1 1 0;
		height: 6px;
		border-radius: 3px;
		background: var(--border);
	}

	li.done,
	li.current {
		background: var(--brand-text);
	}

	.step-caption strong {
		color: var(--brand-text);
	}
</style>
