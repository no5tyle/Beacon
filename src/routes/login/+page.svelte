<script lang="ts">
	import { install } from '#lib/stores/install.svelte.js';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { asset } from '$app/paths';
	import Icon from '#lib/components/Icon.svelte';
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
	// Keep the login on this device, so reopening or reloading Beacon doesn't sign out
	let keepSignedIn = $state(false);
	let showKeepInfo = $state(false);
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
		const result = await app.login(
			chosenBranch,
			memberField.value.trim(),
			passwordField.value,
			keepSignedIn
		);
		loggingIn = false;
		if (!result.ok) {
			error = result.message;
			return;
		}
		writeSetting(BRANCH_KEY, chosenBranch);
		// In the installed app, ask once whether to stay signed in, rather than signing out at every close
		app.offerKeepSignedIn = !keepSignedIn && install.isInstalledApp;
		passwordField.value = '';
		goto(pagePath(''));
	}
</script>

<svelte:head>
	<title>Beacon / Login</title>
</svelte:head>

<div class="login-page">
	<header class="hero">
		<img class="app-icon" src={asset('icon-192.png')} width="60" height="60" alt="" />
		<h2>Log in to Beacon</h2>
		<p class="muted">Use your Scouts Australia member number and Terrain password.</p>
	</header>

	<InstallHint />

	<form class="card login" onsubmit={logIn}>
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
		<div class="keep-row">
			<label class="keep">
				<input
					id="keepSignedIn"
					type="checkbox"
					class="form-check-input"
					bind:checked={keepSignedIn}
				/>
				<span>
					Keep me signed in on this device
					<small class="muted">Until you log out. Only tick it on your own phone or computer.</small
					>
				</span>
			</label>
			<!-- Outside the label, so it explains rather than ticks the box -->
			<button
				type="button"
				class="keep-info-button"
				aria-label="About keeping you signed in"
				aria-expanded={showKeepInfo}
				aria-controls="keepInfo"
				onclick={() => (showKeepInfo = !showKeepInfo)}><Icon name="info" /></button
			>
		</div>
		{#if showKeepInfo}
			<div id="keepInfo" class="alert alert-info small keep-info">
				<p>
					Ticked, Beacon stores a <strong>refresh token</strong> from Terrain on this device: what Terrain
					uses to renew your login without your password. It's encrypted, and kept until you log out or
					Terrain stops accepting it.
				</p>
				<p>
					While it's stored, anyone who can open Beacon on this device can use Terrain as you,
					including recording and approving for your youth members. Consider that before ticking it:
					leave it unticked on a shared or borrowed device, and keep your device locked.
				</p>
			</div>
		{/if}
		{#if error}
			<div class="alert alert-danger" role="alert">{error}</div>
		{:else if app.resumeFailed}
			<div class="alert alert-info" role="status">
				Couldn't reach Terrain to sign you back in.
				<button type="button" class="retry" onclick={() => app.retryResume()}>Try again</button>, or
				log in.
			</div>
		{:else if app.sessionExpired}
			<div class="alert alert-info" role="status">
				Your Terrain login expired. Log in again to carry on.
			</div>
		{/if}
		<button id="logIn" type="submit" class="btn btn-primary log-in" disabled={loggingIn}>
			{loggingIn ? 'Logging in...' : 'Log In'}
		</button>
	</form>

	<p class="small muted privacy">
		Your password goes only to Terrain and is never saved. Keeping you signed in keeps only
		Terrain's renewal token, encrypted, on this device.
		<a href="https://github.com/no5tyle/Beacon/blob/main/PRIVACY.md" target="_blank" rel="noopener"
			>How Beacon handles your information</a
		>
	</p>

	<!-- Tapping the version shows what the login fields heard, to help track down a password manager
	     fill that isn't picked up -->
	<button type="button" class="version" onclick={() => (showDiagnostics = !showDiagnostics)}>
		Beacon version {VERSION}
	</button>
	{#if showDiagnostics}
		<pre class="diagnostics">{diagnostics.join('\n')}</pre>
	{/if}
</div>

<style>
	/* A narrow column, like a sign in sheet: centred on phones, beside the sidebar on wider screens */
	.login-page {
		max-width: 26rem;
		margin: 0 auto;
	}

	.hero {
		margin: 0 0 1rem;
		text-align: center;
	}

	.app-icon {
		display: block;
		width: 60px;
		height: 60px;
		margin: 0 auto 0.6rem;
		border-radius: 22%;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
	}

	.hero h2 {
		margin-bottom: 0.25rem;
	}

	.hero p {
		margin: 0;
	}

	.login {
		margin-top: 1rem;
	}

	.retry {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
	}

	.keep-row {
		display: flex;
		align-items: flex-start;
		gap: 0.25rem;
	}

	.keep-info-button {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		margin-top: -0.6rem;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--tint);
		font-size: 1.1rem;
	}

	.keep-info p {
		margin: 0;
	}

	.keep-info p + p {
		margin-top: 0.4rem;
	}

	.keep {
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		min-height: 44px;
		margin: 0.25rem 0 0.75rem;
		cursor: pointer;
	}

	.keep input {
		flex-shrink: 0;
		margin-top: 0.15rem;
	}

	.keep small {
		display: block;
	}

	.log-in {
		width: 100%;
		margin-top: 0.25rem;
	}

	.privacy {
		margin: 0.75rem 0.25rem 0;
		text-align: center;
	}

	.version {
		display: block;
		margin: 1.5rem auto 0;
		padding: 0.5rem 1rem;
		border: 0;
		background: none;
		color: var(--faint);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.diagnostics {
		max-height: 45vh;
		overflow: auto;
		margin: 0.5rem 0 0;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
		color: var(--text);
		font-size: 0.7rem;
		white-space: pre-wrap;
	}
</style>
