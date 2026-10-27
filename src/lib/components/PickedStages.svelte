<!--
	The stages with statements picked, grouped by stream: open a stage to see its statements again, or
	clear a stage, a stream, or everything.
-->
<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import type { OASStage } from '#lib/model/oas/templates.js';
	import { asc, groupBy, sortBy } from '#lib/model/util.js';

	interface Props {
		picked: { stage: OASStage; count: number }[];
		disabled?: boolean;
		onopen: (stage: OASStage) => void;
		onclear: (stages: OASStage[]) => void;
	}

	let { picked, disabled = false, onopen, onclear }: Props = $props();

	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
	const streams = $derived(
		groupBy(
			sortBy(
				picked,
				asc((p) => p.stage.stream),
				asc((p) => p.stage.stage),
				asc((p) => p.stage.branch)
			),
			(p) => p.stage.stream
		)
	);
</script>

{#if picked.length > 0}
	<div class="card picked">
		<div class="picked-head">
			<strong>Picked</strong>
			<button
				type="button"
				class="btn btn-link btn-sm text-danger"
				{disabled}
				onclick={() => onclear(picked.map((p) => p.stage))}>Clear all</button
			>
		</div>
		{#each streams as stream (stream.key)}
			<div class="stream-row">
				<span class="small muted">{stream.key}</span>
				{#if streams.length > 1 || stream.items.length > 1}
					<button
						type="button"
						class="btn btn-link btn-sm text-danger"
						{disabled}
						onclick={() => onclear(stream.items.map((p) => p.stage))}>Clear {stream.key}</button
					>
				{/if}
			</div>
			{#each stream.items as p (p.stage.templateLink)}
				<div class="picked-row">
					<button
						type="button"
						class="btn btn-link btn-sm grow"
						{disabled}
						onclick={() => onopen(p.stage)}
						>{p.stage.stream} Stage {p.stage.stage} · {plural(p.count, 'statement')}</button
					>
					<button
						type="button"
						class="btn btn-link btn-sm text-danger"
						aria-label="Remove {p.stage.stream} Stage {p.stage.stage}"
						{disabled}
						onclick={() => onclear([p.stage])}><Icon name="x" /></button
					>
				</div>
			{/each}
		{/each}
		{#if picked.length === 1}
			<div class="small muted">Pick statements from other streams or stages too, if you like.</div>
		{/if}
	</div>
{/if}

<style>
	.picked {
		margin: 1rem 0 0;
	}

	.picked-head,
	.stream-row,
	.picked-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stream-row {
		margin-top: 0.25rem;
	}

	.grow {
		flex: 1;
		min-width: 0;
		justify-content: flex-start;
		padding-left: 0;
		text-align: left;
	}
</style>
