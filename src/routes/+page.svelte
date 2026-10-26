<!-- Beacon opens at the page it's mostly used for: Insights for leaders, their own Progress for youth -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { pagePath } from '#lib/paths.js';
	import { app } from '#lib/services/index.js';

	$effect(() => {
		if (app.isSignedIn)
			goto(pagePath(app.isYouth ? 'progress/' : 'insights/'), { replaceState: true });
	});
</script>

<svelte:head>
	<title>Beacon</title>
</svelte:head>
