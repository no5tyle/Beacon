<!-- Patrols is now the Youth page's grouping by patrol: an old link or bookmark goes there -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { pagePath } from '#lib/paths.js';
	import { writeSetting, YOUTH_GROUP_KEY } from '#lib/stores/storage.js';

	$effect(() => {
		writeSetting(YOUTH_GROUP_KEY, 'patrol');
		goto(pagePath('progress/'), { replaceState: true });
	});
</script>
