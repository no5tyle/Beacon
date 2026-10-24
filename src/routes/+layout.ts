// Beacon runs entirely in the browser and talks straight to Terrain, so nothing is rendered on a server.
// Each page is still written out as an empty shell at build time, so it opens directly from its address.
export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';
