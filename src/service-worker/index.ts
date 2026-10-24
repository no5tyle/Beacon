// Beacon's service worker. Network first, so every release is picked up straight away, with a saved copy
// of Beacon's own files so the app (and Beacon Reference) still opens without signal. Besides Beacon's own
// files only Terrain's public OAS templates are kept, for the Reference at camp; never any member's data,
// so no youth details are stored on the device.
import { self } from '$app/service-worker';
import { assets, immutable, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE_PREFIX = 'beacon-';
const CACHE = CACHE_PREFIX + version;
// The Blazor app's caches. Both apps are served from no5tyle.github.io and share its caches, so they're
// only cleared once this app has taken over the Blazor app's address; until then they belong to the live app
const OLD_CACHE_PREFIXES = ['topo-app-', 'topo-reference-'];
const tookOverBlazorApp = new URL(self.registration.scope).pathname === '/Beacon/';

// Paths in the manifest are relative to where Beacon is served from, which is this worker's scope
const inScope = (path: string) => new URL(path.replace(/^\//, ''), self.registration.scope).href;
const files = [...immutable, ...assets, ...prerendered].map((file) => inScope(file.path));

// Terrain's public OAS templates, kept across releases so a saved Reference stays saved
const TEMPLATES_ORIGIN = 'https://templates.terrain.scouts.com.au';
const TEMPLATES_CACHE = 'reference-templates';
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(files))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				const ours = key.startsWith(CACHE_PREFIX) && key !== CACHE;
				const oldApp =
					tookOverBlazorApp && OLD_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
				if (ours || oldApp) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const origin = new URL(request.url).origin;
	if (origin === TEMPLATES_ORIGIN) event.respondWith(template(request));
	else if (origin === self.location.origin) event.respondWith(networkFirst(request));
});

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		// Any address opens from the app shell, which then routes to the right page
		if (request.mode === 'navigate') {
			const shell = await cache.match(inScope('404.html'));
			if (shell) return shell;
		}
		throw new Error('Offline and not saved: ' + request.url);
	}
}

// A slow connection falls back to a saved template when there is one; otherwise it keeps waiting, so a
// first visit over poor signal still loads
async function template(request: Request): Promise<Response> {
	const cache = await caches.open(TEMPLATES_CACHE);
	const network = fetch(request).then((response) => {
		if (response.ok) cache.put(request, response.clone());
		return response;
	});
	network.catch(() => undefined);
	const slow = new Promise<'slow'>((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'slow'));
	try {
		const first = await Promise.race([network, slow]);
		if (first !== 'slow') return first;
		return (await cache.match(request, { ignoreSearch: true })) ?? (await network);
	} catch {
		const cached = await cache.match(request, { ignoreSearch: true });
		if (cached) return cached;
		throw new Error('Offline and not saved: ' + request.url);
	}
}
