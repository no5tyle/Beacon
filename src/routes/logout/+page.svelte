<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';
	import { signedOutHome } from '#lib/signedOut.js';

	onMount(() => {
		app.logout();
		goto(pagePath(signedOutHome(false)), { replaceState: true });
	});
</script>
