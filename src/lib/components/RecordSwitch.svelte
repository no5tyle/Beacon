<!-- Moves between what Record can record: OAS statements, a unit activity, or a youth's SIA plan -->
<script lang="ts">
	import { page } from '$app/state';
	import { pagePath } from '#lib/paths.js';

	const choices = [
		{ href: 'oas/sign-off/', label: 'OAS' },
		{ href: 'record/activity/', label: 'Activity' },
		{ href: 'record/sia-plan/', label: 'SIA' }
	];
	const current = $derived(page.url.pathname);
</script>

<nav class="tabs record-switch" aria-label="Record">
	{#each choices as choice (choice.href)}
		{@const here = current.endsWith(`/${choice.href}`)}
		<a aria-current={here ? 'page' : undefined} href={pagePath(choice.href)}>{choice.label}</a>
	{/each}
</nav>

<style>
	.record-switch {
		margin-bottom: 0.75rem;
	}
</style>
