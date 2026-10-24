# Contributing to Beacon

Thanks for helping. Beacon is used by leaders to record youth members' achievements in Terrain, so the bar for anything that writes to Terrain is high. Everything else is meant to be easy to pick up.

## Getting set up

1. Install [Node.js](https://nodejs.org) 24 or later (`.nvmrc` has the version, for `nvm use`).
2. `npm install`
3. `npm run dev` and open http://localhost:5173

| Command             | What it does                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | Runs Beacon locally, reloading as you edit                                                                                       |
| `npm run check`     | Type checks the app and the service worker                                                                                       |
| `npm run lint`      | Checks formatting (Prettier) and code (ESLint)                                                                                   |
| `npm run format`    | Fixes formatting                                                                                                                 |
| `npm run test:unit` | Unit tests (Vitest), watching for changes                                                                                        |
| `npm run test:e2e`  | Page tests (Playwright) against a production build, at phone and desktop sizes. Run `npx playwright install chromium` once first |
| `npm run build`     | Builds the site into `build/`                                                                                                    |

Before pushing, run `npm run check && npm run lint && npm run test:unit -- --run && npm run test:e2e`. CI runs the same on every pull request.

## How the code is organised

```
src/
  lib/
    terrain/       Talking to Terrain: login, every request, and the profile gate. No Svelte in here
    model/         Beacon's rules: Insights, OAS recording, sign off and the OAS reference. No Svelte, no fetch
    services/      Loading and saving data for the pages: members, unit progress, Insights, Progress,
                   Record OAS and the Reference. Plain TypeScript, tested against a fake Terrain
    stores/        The signed in leader and chosen unit (app.svelte.ts), request logging, install state
    components/    Shared Svelte components (AppNav, Icon, InstallHint, ChooseUnit, ...)
    actions/       Svelte actions, e.g. pull to refresh
    styles/        theme.css (colours, light and dark) and base.css (buttons, forms, cards, ...)
    icons.ts       The Open Iconic icons Beacon uses, as SVG paths
    navigation.ts  Which pages appear in the tab bar, sidebar and More menu
    paths.ts       pagePath(): use it for every link to a page
  routes/          One folder per page
  service-worker/  Keeps Beacon's own files for opening without signal
tests/
  unit/            Vitest tests for src/lib/model
  fixtures/        A made-up unit's progress and OAS answers, and Terrain's public OAS templates
  golden/          Results from the Blazor version of Beacon that the port must match (see its README)
  e2e/             Playwright page tests
static/            Icons and the two web app manifests (Beacon and Beacon Reference)
```

`lib/terrain` and `lib/model` never import Svelte, so the important logic can be read and tested without knowing the framework.

## Svelte in brief

Beacon uses Svelte 5. A page is a `.svelte` file with a `<script lang="ts">` block, the markup, and a `<style>` block that only applies to that file. The few pieces of Svelte to know:

- `let count = $state(0)` is a value the page re-draws when it changes.
- `const total = $derived(a + b)` is worked out from other values and stays up to date.
- `let { title } = $props()` reads what a component is given.
- `$effect(() => { ... })` runs code when the values it reads change. Use it sparingly.

The [Svelte tutorial](https://svelte.dev/tutorial) takes about an hour and covers everything Beacon uses.

## Styles

There's no CSS framework. `src/lib/styles/base.css` has the shared pieces, with class names that follow Bootstrap's (`btn btn-primary`, `form-control`, `alert alert-warning`...). Colours always come from the variables in `theme.css`, never hard-coded, so dark mode works everywhere. The style guide page (`/styles/`) shows every shared piece in light and dark mode.

Beacon is phone first: check changes at about 390 px wide, keep buttons at least 44 px tall, and make sure nothing scrolls sideways.

## Rules for anything that talks to Terrain

- **Never store passwords or tokens** on the device, or send them anywhere but Terrain.
- **Writes must match what the current app sends.** Saving or submitting OAS records has golden tests (`tests/golden`) comparing request bodies with the Blazor version of Beacon. Change them only with a real Terrain capture to back it up.
- **Acting as a youth is exclusive.** While Beacon has switched Terrain to a youth's profile, nothing else may talk to Terrain. Every request goes through `Terrain` in `src/lib/terrain/client.ts`, whose profile gate holds other requests back; anything done as a youth goes inside `terrain.actAsYouth(...)`, using the client it's given.
- **Never `fetch` Terrain directly** from a page or service; add a method to `Terrain` instead, with a test in `tests/unit/terrain.test.ts`.
- **Don't guess Terrain's API.** If you need a request Beacon doesn't make yet, capture it from Terrain's own app first and leave out the `authorization` header when sharing it.
- **The login lives in memory only.** Reloading the page signs the leader out, as in the Blazor app. Page tests move around with `navigate()` from `tests/e2e/terrain.ts` rather than `page.goto()` for that reason.
- **Test data is made up.** Tests and screenshots use the fake "Mt Example Scouts" unit, never real youth.
