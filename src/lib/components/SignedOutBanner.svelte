<!--
	Above the Reference for a signed out visitor in a browser tab: what logging in adds, and the way in
-->
<script lang="ts">
	import { pagePath } from '#lib/paths.js';
</script>

<div class="signed-out-banner" role="note">
	<span>Log in for progress, insights, OAS sign offs and approvals.</span>
	<a class="btn btn-primary btn-sm" href={pagePath('login/')}>Log in</a>
</div>

<style>
	.signed-out-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		padding: 0.4rem 0.4rem 0.4rem 0.9rem;
		border-radius: 999px;
		background: var(--alert-info-bg);
		color: var(--alert-info-text);
		font-size: 0.875rem;
		line-height: 1.3;
	}

	.signed-out-banner span {
		flex: 1;
	}

	.signed-out-banner .btn {
		flex: none;
		min-height: 32px;
		padding: 0.2rem 0.9rem;
		font-size: 0.875rem;
	}

	/* Two lines of text on a phone don't sit well in a capsule */
	@media (max-width: 640.98px) {
		.signed-out-banner {
			border-radius: var(--radius-lg);
		}
	}
</style>
