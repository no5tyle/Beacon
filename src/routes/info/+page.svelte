<!-- Info: who's signed in, what each page is for, and where to get help -->
<script lang="ts">
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';
</script>

<svelte:head>
	<title>Beacon / Info</title>
</svelte:head>

<h2>About Beacon</h2>
<p class="muted">Signed in as {app.memberName}</p>

{#if app.isYouth}
	<p>
		Use Progress to see where you're up to, and Reference to look up any OAS statement and its
		explanation.
	</p>
{:else}
	<p>Use Insights to see the unit's OAS gaps, who is moving up soon and what to programme next.</p>
	<p>
		Use Record to tick off the same OAS statements for several youth at once, e.g. at the end of a
		unit night, log an activity, or plan a youth's SIA.
	</p>
	<p>
		Use Progress to see where each youth is up to, record their OAS statements and submit stages for
		review.
	</p>
	<p>Use Reference to look up any OAS statement and its explanation.</p>
	<p>
		The group and unit every page works on are chosen under More on a phone, or in the sidebar on a
		computer.
	</p>
{/if}
<p class="small muted">
	Printable reports such as the wallchart, patrol lists and sign in sheets are in the desktop
	<a href="https://nomisnostab.github.io/Topo-Blazor/" target="_blank" rel="noopener">Topo</a> app.
	Having a problem? <a href={pagePath('logging/')}>Turn on logging</a> to help track it down. You can
	also open it any time by tapping the version number.
</p>
