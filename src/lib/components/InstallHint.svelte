<!-- Suggests adding Beacon to the Home Screen, only when it's open in a browser rather than as the installed app -->
<script lang="ts">
	import { asset } from '$app/paths';
	import Icon from './Icon.svelte';
	import { install } from '#lib/stores/install.svelte.js';

	const show = $derived(
		!install.dismissed && (install.state === 'prompt' || install.state === 'ios')
	);
</script>

{#if show}
	<div class="install-hint" role="note">
		<img src={asset('icon-192.png')} width="40" height="40" class="install-icon" alt="" />
		<div class="install-text">
			<strong>Add Beacon to your Home Screen</strong>
			{#if install.state === 'ios'}
				<div class="small">
					Tap <Icon name="share-boxed" label="Share" /> Share, then <em>Add to Home Screen</em>, to
					open it like an app.
				</div>
			{:else}
				<div class="small">Open it like an app, full screen and one tap away.</div>
			{/if}
		</div>
		{#if install.state === 'prompt'}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => install.install()}
				>Install</button
			>
		{/if}
		<button
			type="button"
			class="close"
			aria-label="Don't show again"
			onclick={() => install.dismiss()}
		>
			<Icon name="x" />
		</button>
	</div>
{/if}

<style>
	.install-hint {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 0.75rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
	}

	.install-icon {
		flex-shrink: 0;
		border-radius: var(--radius-lg);
	}

	.install-text {
		flex: 1 1 auto;
		min-width: 0;
	}

	.close {
		align-self: flex-start;
		flex-shrink: 0;
		min-width: 32px;
		min-height: 32px;
		border: 0;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
</style>
