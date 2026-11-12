<!--
	"Are you sure?" in Beacon's own style, rather than the browser's confirm box. Show it with `open`;
	`onanswer` hears true when the action is confirmed, false on Cancel, Escape or a tap outside.
-->
<script lang="ts">
	let {
		open,
		title,
		message = '',
		confirmLabel,
		danger = false,
		onanswer
	}: {
		open: boolean;
		title: string;
		message?: string;
		confirmLabel: string;
		/** Red, for something that can't be undone; focus then starts on Cancel */
		danger?: boolean;
		onanswer: (confirmed: boolean) => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let cancelButton = $state<HTMLButtonElement>();
	let confirmButton = $state<HTMLButtonElement>();

	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
			(danger ? cancelButton : confirmButton)?.focus();
		} else if (!open && dialog.open) dialog.close();
	});

	function answer(confirmed: boolean) {
		if (dialog.open) dialog.close();
		onanswer(confirmed);
	}
</script>

<dialog
	bind:this={dialog}
	class="confirm"
	aria-labelledby="confirm-title"
	oncancel={(e) => {
		e.preventDefault();
		answer(false);
	}}
	onclick={(e) => e.target === dialog && answer(false)}
>
	<!-- Drawn only while open, so a closed dialog adds nothing to the page -->
	{#if open}
		<h2 id="confirm-title">{title}</h2>
		{#if message}<p class="muted">{message}</p>{/if}
		<div class="actions">
			<button
				bind:this={cancelButton}
				type="button"
				class="btn btn-outline-secondary"
				onclick={() => answer(false)}>Cancel</button
			>
			<button
				bind:this={confirmButton}
				type="button"
				class="btn {danger ? 'btn-danger' : 'btn-primary'}"
				onclick={() => answer(true)}>{confirmLabel}</button
			>
		</div>
	{/if}
</dialog>

<style>
	.confirm {
		width: min(23rem, calc(100vw - 2rem));
		padding: 1.25rem;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
		text-align: center;
	}

	.confirm::backdrop {
		background: rgba(0, 0, 0, 0.35);
		-webkit-backdrop-filter: blur(4px);
		backdrop-filter: blur(4px);
	}

	.confirm h2 {
		margin: 0 0 0.4rem;
		font-size: 1.1875rem;
	}

	.confirm p {
		margin: 0;
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin-top: 1rem;
	}
</style>
