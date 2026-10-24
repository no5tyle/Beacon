<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';

	onMount(() => {
		app.logout();
		goto(pagePath('login/'), { replaceState: true });
	});
</script>
