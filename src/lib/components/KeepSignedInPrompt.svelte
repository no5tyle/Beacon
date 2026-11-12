<!--
	Asked once after logging in to the installed app without "Keep me signed in": the installed app is
	usually on the leader's own phone, and without it Beacon asks for the password every time it opens
-->
<script lang="ts">
	import { app } from '#lib/services/index.js';

	let saving = $state(false);
	let failed = $state(false);

	async function keep() {
		saving = true;
		failed = !(await app.keepSignedInNow());
		saving = false;
	}
</script>

{#if app.offerKeepSignedIn || failed}
	<div
		class="keep-prompt card"
		role="dialog"
		aria-labelledby="keep-title"
		aria-describedby="keep-text"
	>
		{#if failed}
			<p id="keep-title" class="keep-title">This device can't keep the login</p>
			<p id="keep-text" class="muted">
				The browser didn't allow it (for example in private browsing). You'll log in again next
				time.
			</p>
			<div class="keep-actions">
				<button type="button" class="btn btn-primary" onclick={() => (failed = false)}>OK</button>
			</div>
		{:else}
			<p id="keep-title" class="keep-title">Stay signed in on this device?</p>
			<p id="keep-text" class="muted">
				Beacon will open signed in until you log out, without asking for your password. Only on a
				phone that's yours.
			</p>
			<div class="keep-actions">
				<button
					type="button"
					class="btn btn-outline-secondary"
					onclick={() => (app.offerKeepSignedIn = false)}
					disabled={saving}>Not now</button
				>
				<button type="button" class="btn btn-primary" onclick={keep} disabled={saving}>
					{saving ? 'Saving…' : 'Stay signed in'}
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.keep-prompt {
		position: fixed;
		left: max(env(safe-area-inset-left), 0.75rem);
		right: max(env(safe-area-inset-right), 0.75rem);
		bottom: calc(var(--tab-bar-height) + 0.75rem);
		z-index: 30;
		max-width: 28rem;
		margin: 0 auto;
		padding: 1rem 1.1rem;
		box-shadow:
			var(--shadow),
			0 0 0 0.5px var(--border);
		animation: keep-in 0.3s cubic-bezier(0.32, 0.72, 0, 1);
	}

	@media (min-width: 641px) {
		.keep-prompt {
			bottom: 1.5rem;
		}
	}

	@keyframes keep-in {
		from {
			opacity: 0;
			transform: translateY(1rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.keep-prompt {
			animation: none;
		}
	}

	.keep-title {
		margin: 0 0 0.25rem;
		font-weight: 600;
	}

	.keep-prompt .muted {
		margin: 0;
		font-size: 0.9375rem;
	}

	.keep-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
</style>
