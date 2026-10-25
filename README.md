# Beacon

Beacon is a phone-first helper for Scouts Australia leaders. It reads your unit's records from [Terrain](https://terrain.scouts.com.au) and turns them into the things you need at the hall: who's close to finishing what, what to programme next, and quick OAS sign offs after a unit night.

**Use it at https://no5tyle.github.io/Beacon/**, and add it to your phone's Home Screen. The OAS reference also installs on its own as Beacon Reference, which works without signal.

Beacon is built with [Svelte](https://svelte.dev) and [SvelteKit](https://svelte.dev/docs/kit). It replaced the original Blazor version (now [no5tyle/Beacon-blazor](https://github.com/no5tyle/Beacon-blazor), archived). Every push to `main` is checked and published to the address above.

## Contributing

You need [Node.js](https://nodejs.org) 24 or later. Then:

```
npm install
npm run dev          # http://localhost:5173, reloads as you edit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is organised, the checks to run before pushing, and the rules for anything that talks to Terrain.

## How Beacon works

- **No Beacon server.** Beacon runs entirely in your browser and talks straight to Terrain with your own login, so it can only see and change what your Terrain account can.
- **Nothing sensitive is stored.** Your password and Terrain's tokens are never saved on the device. Beacon only remembers preferences such as your branch and chosen unit, plus a copy of its own files so it opens without signal. [PRIVACY.md](PRIVACY.md) explains everything Beacon does with your information.
- **Terrain has no public API.** Beacon uses the same requests Terrain's own app makes, so a change to Terrain can break things until Beacon is updated. A daily check (`.github/workflows/check-terrain.yml`) watches Terrain's OAS templates for changes. Beacon isn't made or supported by Scouts Australia.

## Credits

Beacon started as a fork of [Topo](https://github.com/NomisNostab/Topo-Blazor) by Simon Batson. Icons are from [Open Iconic](https://github.com/iconic/open-iconic) (MIT).
