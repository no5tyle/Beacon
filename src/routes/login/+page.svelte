<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import InstallHint from '#lib/components/InstallHint.svelte';
	import { watchLoginAutofill } from '#lib/loginAutofill.js';
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';
	import { VERSION } from '#lib/stores/app.svelte.js';
	import { BRANCH_KEY, readSetting, writeSetting } from '#lib/stores/storage.js';

	const BRANCHES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

	let branchField: HTMLSelectElement;
	let memberField: HTMLInputElement;
	let passwordField: HTMLInputElement;
	let branch = $state('');
	let error = $state('');
	let loggingIn = $state(false);
	let showDiagnostics = $state(false);
	let diagnostics = $state<string[]>([]);

	// Already signed in: straight to Home
	$effect(() => {
		if (app.isSignedIn) goto(pagePath(''), { replaceState: true });
	});

	onMount(() => {
		// Only the branch is remembered; the phone's password manager can fill in the member number and password
		const saved = readSetting(BRANCH_KEY);
		if (BRANCHES.some((b) => b.toLowerCase() === saved)) branch = saved;

		let stop = () => {};
		tick().then(() => {
			// The cursor goes in the first empty field. iOS only shows the keyboard for a tap, so there it does nothing
			const firstEmpty = [branchField, memberField, passwordField].find((field) => !field.value);
			firstEmpty?.focus();
			stop = watchLoginAutofill(
				{ branch: branchField, member: memberField, password: passwordField },
				{
					onFilled: () => logIn(),
					note: (text) => {
						const seconds = (performance.now() / 1000).toFixed(2);
						diagnostics = [...diagnostics.slice(-39), `${seconds}s ${text}`];
					}
				}
			);
		});
		return () => stop();
	});

	async function logIn(event?: Event) {
		event?.preventDefault();
		if (loggingIn) return;
		// Read the fields themselves, as a password manager can fill them without the page hearing about it
		const chosenBranch = branchField.value;
		if (!chosenBranch) {
			error = 'Select your branch.';
			return;
		}
		loggingIn = true;
		error = '';
		const result = await app.login(chosenBranch, memberField.value.trim(), passwordField.value);
		loggingIn = false;
		if (!result.ok) {
			error = result.message;
			return;
		}
		writeSetting(BRANCH_KEY, chosenBranch);
		passwordField.value = '';
		goto(pagePath(''));
	}
</script>

<svelte:head>
	<title>Beacon / Login</title>
</svelte:head>

<h2>Log in to Beacon</h2>
<p class="muted">Use your Scouts Australia member number and Terrain password.</p>

<InstallHint />

<form class="login" onsubmit={logIn}>
	<div class="field">
		<label class="form-label" for="branch">Branch</label>
		<select id="branch" class="form-select" bind:this={branchField} bind:value={branch}>
			<option value="">Select branch</option>
			{#each BRANCHES as name (name)}
				<option value={name.toLowerCase()}>{name}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label class="form-label" for="memberNumber">Member Number</label>
		<input
			id="memberNumber"
			class="form-control"
			placeholder="Member Number"
			autocomplete="username"
			inputmode="numeric"
			bind:this={memberField}
		/>
	</div>
	<div class="field">
		<label class="form-label" for="password">Password</label>
		<input
			id="password"
			class="form-control"
			type="password"
			placeholder="Password"
			autocomplete="current-password"
			bind:this={passwordField}
		/>
	</div>
	{#if error}
		<div class="alert alert-danger" role="alert">{error}</div>
	{:else if app.sessionExpired}
		<div class="alert alert-info" role="status">
			Your Terrain login expired. Log in again to carry on.
		</div>
	{/if}
	<button id="logIn" type="submit" class="btn btn-primary" disabled={loggingIn}>
		{loggingIn ? 'Logging in...' : 'Log In'}
	</button>
</form>

{#if showDiagnostics}
	<pre class="diagnostics">{diagnostics.join('\n')}</pre>
{/if}
<button type="button" class="version" onclick={() => (showDiagnostics = !showDiagnostics)}>
	Beacon version {VERSION}
</button>

<style>
	.login {
		max-width: 26rem;
	}

	/* Version at the bottom of the screen, clear of the iPhone home indicator. Tapping it shows what the
	   login fields heard, to help track down a password manager fill that isn't picked up */
	.version {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 0.5rem 1rem max(env(safe-area-inset-bottom), 0.5rem);
		border: 0;
		background: none;
		color: var(--faint);
		font: inherit;
		font-size: 0.75rem;
		text-align: center;
		cursor: pointer;
	}

	.diagnostics {
		position: fixed;
		left: 0.5rem;
		right: 0.5rem;
		bottom: 2.5rem;
		z-index: 20;
		max-height: 45vh;
		overflow: auto;
		margin: 0;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		color: var(--text);
		font-size: 0.7rem;
		white-space: pre-wrap;
	}

	@media (min-width: 641px) {
		.version {
			left: 250px;
		}
	}
</style>
