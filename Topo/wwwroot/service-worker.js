// Service worker for the installed Beacon app (Beacon Reference has its own under reference/).
// Network first so every release is picked up straight away. Only Beacon's own files are kept,
// never Terrain's data, so the app still opens without signal but no youth details are stored.
const CACHE_PREFIX = "topo-app-";
const CACHE = CACHE_PREFIX + "v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // Leave Beacon Reference's cache alone
        for (const key of await caches.keys()) {
            if (key.startsWith(CACHE_PREFIX) && key !== CACHE)
                await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin)
        return;
    event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok)
            cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached)
            return cached;
        // Any page of the app opens from the start page, which the router then sends to the right place
        if (request.mode === "navigate") {
            const start = await cache.match(new URL("./", self.registration.scope).href);
            if (start)
                return start;
        }
        throw new Error("Offline and not cached: " + request.url);
    }
}
