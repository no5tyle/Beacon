// Service worker for the installed Topo Reference app.
// Network first so the app always picks up new releases and template changes,
// falling back to the last copy seen so the reference still opens without signal.
const CACHE_PREFIX = "topo-reference-";
const CACHE = CACHE_PREFIX + "v1";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // Leave the main Topo app's cache alone
        for (const key of await caches.keys()) {
            if (key.startsWith(CACHE_PREFIX) && key !== CACHE)
                await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET")
        return;
    event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    const network = fetch(request).then(response => {
        if (response.ok || response.type === "opaque")
            cache.put(request, response.clone());
        return response;
    });
    network.catch(() => { });
    // A slow connection only falls back when there is a copy to fall back to,
    // otherwise it keeps waiting so a first visit over poor signal still loads
    const slow = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, "slow"));
    try {
        const first = await Promise.race([network, slow]);
        if (first !== "slow")
            return first;
        return (await cache.match(request, { ignoreSearch: true })) ?? await network;
    } catch {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached)
            return cached;
        throw new Error("Offline and not cached: " + request.url);
    }
}
