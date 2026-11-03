<!--
	What NAAF Appendix 1 asks of the verifier, for stages that need more than Scouting Adventure (SA):
	a warning before saving, naming each stage's level, or a note for the stream being recorded
-->
<script lang="ts">
	import { NAAF_LINK, NAAF_TITLE, type VerifierRequirement } from '#lib/model/oas/naaf.js';

	let {
		requirements,
		stream = '',
		fromStage = null
	}: {
		/** The stages being saved that need more than SA */
		requirements: VerifierRequirement[];
		/** For the note: the stream being recorded, and its first stage that needs more than SA */
		stream?: string;
		fromStage?: number | null;
	} = $props();

	const level = (r: VerifierRequirement) => `${r.levelName} (${r.level})`;
</script>

{#if requirements.length > 0}
	<div class="alert alert-warning small verifier-levels" role="note">
		{#if requirements.length === 1}
			Verifying {requirements[0].title} needs {level(requirements[0])} or above.
		{:else}
			<strong>These need more than Scouting Adventure (SA) to verify:</strong>
			<ul>
				{#each requirements as r (r.title)}
					<li>{r.title}: {level(r)}</li>
				{/each}
			</ul>
		{/if}
		<span class="source"
			>From <a href={NAAF_LINK} target="_blank" rel="noopener">{NAAF_TITLE}</a>, where a youth two
			stages ahead can't verify instead.</span
		>
	</div>
{:else if stream && fromStage !== null}
	<div class="alert alert-info small verifier-levels" role="note">
		{stream} from Stage {fromStage} needs a verifier with more than Scouting Adventure (SA), under
		<a href={NAAF_LINK} target="_blank" rel="noopener">{NAAF_TITLE}</a>. Each stage says which.
	</div>
{/if}

<style>
	.verifier-levels ul {
		margin: 0.25rem 0;
		padding-left: 1.1rem;
	}

	.source {
		display: block;
		margin-top: 0.25rem;
	}
</style>
