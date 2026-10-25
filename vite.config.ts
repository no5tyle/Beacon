import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// The site is served from a sub-path on GitHub Pages (e.g. /Beacon), set by the deploy workflow
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Every page runs in the browser; 404.html lets GitHub Pages open any address in the app
			adapter: adapter({ fallback: '404.html' }),
			paths: { base }
		})
	],
	define: {
		// Short commit hash of the deployed build, shown on the login screen and in More
		__BEACON_VERSION__: JSON.stringify(process.env.BEACON_VERSION?.slice(0, 7) ?? 'dev')
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/unit/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
