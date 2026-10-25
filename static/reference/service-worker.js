// Retires the Blazor Beacon Reference app's service worker.
//
// The Blazor app registered a second service worker here, for /Beacon/reference/, which network-first served
// the Reference from its own "topo-reference-" cache. Beacon's one service worker now covers the Reference too,
// but a browser keeps a service worker whose file has gone. When a phone checks this address for an update it
// gets this file instead, which clears the old cache, removes itself, and reloads any open Reference pages so
// Beacon's own service worker takes them over. Nothing registers this file; it only replaces the old one.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('topo-reference-')) await caches.delete(key);
			}
			await self.registration.unregister();
			const pages = await self.clients.matchAll({ type: 'window' });
			for (const page of pages) page.navigate(page.url);
		})()
	);
});
