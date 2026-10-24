<!-- One of the Open Iconic icons in icons.ts, sized to the text around it -->
<script lang="ts">
	import { icons, type IconName } from '#lib/icons.js';

	let { name, label }: { name: IconName; label?: string } = $props();
</script>

<svg
	class="icon"
	viewBox="0 0 800 800"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<path d={icons[name]} transform="matrix(1 0 0 -1 0 800)" fill="currentColor" />
</svg>

<style>
	.icon {
		display: inline-block;
		flex-shrink: 0;
		width: 1em;
		height: 1em;
		vertical-align: -0.125em;
	}
</style>
