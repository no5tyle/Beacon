# Rebuilding Beacon in Svelte

Beacon is a Blazor WebAssembly app. This plan moves it to **Svelte 5 + SvelteKit + TypeScript**, so that:

- **Contributing is easier.** Scout leaders who code are far more likely to know JavaScript or TypeScript than C# and Razor. Running Svelte needs Node and nothing else.
- **The app is web native.** Home Screen install, safe areas, dark mode, pull to refresh, password autofill and the service worker are all browser features. In Svelte they're used directly, with no calls between C# and JavaScript.
- **The first open is faster.** A Svelte build should be a few hundred KB, where the current app downloads about 4 MB.

Beacon keeps working exactly as it does today throughout the move. The new app is built alongside it and only replaces it once it does everything the current one does.

## Ground rules

1. **Same behaviour first, improvements after.** Each page is ported to match what Beacon does today, with no redesign along the way. Changes come after the switch, so a difference is always a bug.
2. **Logic and its tests move before any page.** The Insights, OAS recording, sign off and approvals rules move to plain TypeScript with no Svelte in them, along with their 65 tests. That way the parts that write to Terrain are proven identical before anything uses them.
3. **Nothing new is stored.** Passwords and tokens are still never kept on the device. Only the same preferences as today are stored: branch, chosen unit, focus youth and similar.
4. **Writes to Terrain stay byte-for-byte the same.** Saving, creating and submitting OAS records, and switching to act as a youth, must send exactly what the current app sends. Tests compare request bodies against the C# output.

## Stack

| Part | Choice | Why |
|---|---|---|
| Framework | Svelte 5 (runes) | HTML-first components, built-in form binding, scoped styles like today's `.razor.css` |
| App framework | SvelteKit with `adapter-static` | Routing and the static build for GitHub Pages; `ssr = false`, so it runs entirely in the browser like today |
| Language | TypeScript (strict) | Keeps Terrain's data shapes and the OAS rules type-checked, as C# does now |
| Build | Vite (comes with SvelteKit) | Fast dev server with hot reload |
| Unit tests | Vitest | The ported versions of the current MSTest suite |
| Page tests | Playwright with a fake Terrain | Builds on the harness used during Beacon's development: mocked Terrain routes, phone viewport |
| Lint and format | ESLint + Prettier + `svelte-check` | One command a contributor runs before pushing |
| Styling | Bootstrap 5 CSS (kept for now) + scoped component styles + the existing CSS variables | Pages look the same on day one; Bootstrap can be trimmed later |
| Icons | Open Iconic SVGs, inlined | Same icons as today, without an icon font |
| PWA | SvelteKit service worker + the two existing manifests | Same install behaviour, Beacon and Beacon Reference as separate apps |

There are no other runtime dependencies to begin with. Each one added later needs a reason in its pull request.

## Project layout

```
web/                              the new app, beside Topo/ until it takes over
  src/
    lib/
      terrain/                    talking to Terrain (no Svelte)
        client.ts                 fetch wrapper: auth header, token refresh, logging, error wording
        auth.ts                   Cognito login and refresh, branch → client id
        profileGate.ts            reads in parallel; acting as a youth runs alone
        members.ts  achievements.ts  templates.ts  approvals.ts  events.ts  metrics.ts
        types.ts                  Terrain's response shapes (from the C# models)
      model/                      Beacon's rules (no Svelte, no fetch)
        insights/                 insightsCalculator, memberInsightsCalculator, skillThemes, prompt builders
        oas/                      recording, signOff, reference
        approvals/                pendingApproval
      services/                   the C# services: caching, preloading, combining Terrain data
      stores/                     session, chosen unit, preferences, logging (Svelte runes)
      components/                 TabBar, MoreMenu, ChooseUnit, InstallHint, PullToRefresh, Preloader, OASReferenceView
      styles/                     app.css and the theme variables (light and dark)
    routes/
      +layout.svelte              tab bar, sign-in guard, preloader
      +layout.ts                  ssr = false, prerender the shell
      login/  (home)/  insights/  oas/sign-off/  progress/  progress/[memberId]/
      progress/[memberId]/record-oas/  oas-reference/  approvals/  logging/  reference/
    service-worker.ts
  static/                         icons, both manifests, reference/
  tests/
    unit/                         Vitest, ported from TopoInsightsTest
    e2e/                          Playwright against a fake Terrain
```

The `lib/terrain` and `lib/model` folders never import Svelte. Their logic can be read, tested and reused without knowing the framework.

## Phases

Each phase ends with something that can be checked, and lands on `main` without affecting the live app.

### Phase 0: Scaffold (1–2 days)

- Create `web/` with SvelteKit, TypeScript, Vitest, Playwright, ESLint, Prettier and `adapter-static`.
- Copy over `app.css`, the theme variables and dark mode, the icons and both manifests.
- Add a GitHub Action that runs `npm ci`, `npm run check`, `npm test` and `npm run build` on every push to `main`. It builds the app but doesn't publish it yet.
- Write `CONTRIBUTING.md`: install Node, `npm install`, `npm run dev`, and how to run the tests.

**Done when:** `npm run dev` shows an empty Beacon shell with the tab bar, and CI is green.

### Phase 1: Model logic and tests (4–6 days)

Port `Model/` to `src/lib/model/` file by file, each with its tests:

| C# | TypeScript | Tests to port |
|---|---|---|
| `Insights/InsightsCalculator.cs`, `InsightsModels.cs`, `InsightsSettings.cs` | `insights/insightsCalculator.ts` | 23 |
| `Insights/MemberInsightsCalculator.cs`, `MemberInsightsModels.cs` | `insights/memberInsightsCalculator.ts` | 9 |
| `Insights/SkillThemeClassifier.cs` | `insights/skillThemes.ts` | (covered above) |
| `Insights/NightPromptBuilder.cs`, `PlanPromptBuilder.cs` | `insights/prompts.ts` | 3 + 4 + 3 privacy |
| `OAS/OASRecording.cs` | `oas/recording.ts` | 8 |
| `OAS/OASSignOff.cs` | `oas/signOff.ts` | 6 |
| `OAS/OASReference.cs` | `oas/reference.ts` | 6 |
| `Approvals/PendingApproval.cs` | `approvals/pendingApproval.ts` | 3 |

Plus **golden tests for the write bodies**. For a set of saved Terrain records, especially older Joey records with no `last_updated`, the C# app's `CreateBody`, `UpdateBody`, `AddVerifications` and `SubmitBody` output is saved as JSON files. The TypeScript versions must produce identical JSON.

**Done when:** all 65 ported tests and the golden tests pass.

### Phase 2: Terrain layer (4–5 days)

- `client.ts`: one fetch wrapper with the `authorization` header, token refresh, request logging for the Logging page, and the existing wording for refusals ("Terrain turned the request away without saying why, or there was no signal.").
- `auth.ts`: Cognito login per branch, refresh, and getting the user and profiles.
- `profileGate.ts`: reads run in parallel, but while Beacon is acting as a youth nothing else may reach Terrain. In TypeScript this is a small async lock in place of `AsyncLocal`. Tests cover a preload running during a sign off.
- Typed functions for each endpoint Beacon uses today: members, unit and member achievements, OAS tree and templates, submissions, events, logbook metrics, assume and revoke profiles, create, update and submit-on-behalf.
- **Leave out** the endpoints only the culled reports used (calendars, additional awards, group life, logbook detail and others), unless a ported page turns out to need one.

**Done when:** unit tests against a fake `fetch` pass for login, token refresh, the profile gate and every write. The write tests reuse the Phase 1 golden files.

### Phase 3: Services and app shell (3–4 days)

- Port `StorageService`, `MembersService`, `ProgressService`, `WallchartService`, `InsightsService`, `OASService`, `OASRecordingService`, `ApprovalsService`, `OASReferenceService` and `PreloadService` into `services/` and `stores/`. That includes caching per unit, the shared in-flight loads with progress reporting, and stopping work on logout.
- Shell: `+layout.svelte` with the tab bar, More menu, sign-in guard, preloader, safe-area handling and pull to refresh.
- Login page: remembered branch, the autofill auto-login (detected by `:autofill`), the diagnostics panel, the version line and the install hint.
- Home: the group and unit selectors. Changing the unit scopes every page, as today.

**Done when:** you can log in against the fake Terrain, pick a unit, move between tabs and log out. The Playwright tests for login, autofill and unit choice pass at phone and desktop widths.

### Phase 4: Pages (8–12 days)

Ported one at a time, most used first. Each page gets a Playwright test that works through it like a leader at a phone screen.

| Order | Page | Notes |
|---|---|---|
| 1 | Record OAS (`/oas/sign-off`) | Steps, patrol filter, verifier, results, submit for review. The most important page to get exactly right |
| 2 | Progress list and youth details | Clickable cards; the details page with insights, activity ideas and AI prompt |
| 3 | Record one youth's OAS (`/progress/[id]/record-oas`) | Save and submit for a single youth |
| 4 | Insights | Stat tiles, OAS gaps heatmap, priority and programming tabs, filters panel, refresh, AI prompt |
| 5 | Approvals | Pending only, youth filter, group by |
| 6 | Reference and the Beacon Reference app | Shared view, offline saving, starred statements, separate manifest and service worker |
| 7 | Logging | Turn on and off, download the log |

**Done when:** every page passes its Playwright test, and screenshots of each page at 390 px wide look the same as today's in light and dark mode.

### Phase 5: Side by side (1–2 weeks of real use)

- The deploy workflow publishes both apps: the current one at `/Beacon/` and the new one at `/Beacon/next/`.
- You, and any leaders willing to help, use `/next/` on a real unit night: sign offs for Joeys, Cubs and Scouts, a submit for review, Insights before programming.
- Anything that differs gets fixed in `/next/`, or noted as an intended change for after the switch.

**Done when:** a full unit night has run on `/next/` with no fallback to the current app, and every item on the parity checklist below is ticked.

### Phase 6: Switch over (1 day)

- The deploy workflow publishes the Svelte app at `/Beacon/` and drops `/next/`.
- Keep the same manifest `id`, `start_url` and scope so installed Home Screen apps carry on working. The new service worker clears the old `topo-app-` caches.
- Move `Topo/`, `Model/` and `TopoInsightsTest/` to a `legacy-blazor` tag, then remove them from `main`. That removal needs your confirmation at the time.
- Update the README's development section and contributor guide.

**Done when:** the live site is the Svelte app, installed apps opened from the Home Screen load it, and `main` holds only the new code.

## Parity checklist

These are the features to tick off in Phase 5.

- [ ] Login: branch remembered, autofill auto-login on iOS and Android, version line, diagnostics panel, errors
- [ ] Signed out goes to login; youth members see only Home, Progress and Reference
- [ ] Home: group and unit selectors, unit remembered, help text, link to Topo
- [ ] Tab bar: Home, Insights, Record, Progress, Reference, More; More has Approvals, logging, Logout and the version
- [ ] Background preload of the unit's progress once a unit is chosen
- [ ] Insights: tiles, heatmap with stream drill-down, priority and programming tabs, filters, focus youth, refresh, AI prompt
- [ ] Record OAS: streams and stages, statements, youth states (to add / already done / locked), patrol filter, verifier, per-youth results, submit ready stages
- [ ] Leaders can't verify stages above 5; only the logbook can be ticked there
- [ ] Joey records without `last_updated` save correctly (golden test and a real save)
- [ ] Progress list, youth details, single-youth record and submit
- [ ] Approvals: pending only, votes so far, youth filter, group by, refresh
- [ ] Reference: filters, search, starred, share links; Beacon Reference installs separately and works offline
- [ ] Logging: turn on and off, download
- [ ] Pull to refresh on Insights, Progress and Approvals; the browser's own pull to refresh is off while signed in
- [ ] Dark mode follows the phone; printing stays light
- [ ] Install hint, and the Home Screen install of both apps
- [ ] Safe areas on phones with notches and rounded corners
- [ ] The daily Terrain check still runs

## How contributing will work

```
cd web
npm install
npm run dev          # http://localhost:5173, hot reload
npm test             # unit tests
npm run test:e2e     # page tests against a fake Terrain, no Terrain login needed
npm run check        # types, lint and format
```

The fake Terrain used by the page tests also powers a `npm run dev:demo` mode. It runs the whole app with the made-up "Mt Example Scouts" unit, so contributors can work on pages without a Terrain account or touching real youth records.

## Risks

| Risk | How it's handled |
|---|---|
| A write to Terrain differs subtly and corrupts or loses a youth's record | Golden tests on every write body (Phase 1), a single shared write path, and a real Joey/Cub/Scout save in Phase 5 before switching |
| Two things reach Terrain at once while it's acting as a youth | The profile gate is ported with tests covering a preload during a sign off |
| Installed Home Screen apps break at the switch | Same manifest `id`, `start_url` and scope; old caches cleared by the new service worker; tested by installing the current app and then deploying the new one to a test path |
| The rewrite drags on while the current app needs fixes | Phases land separately, and fixes go into the current app as usual, with a matching note in the plan's checklist |
| Svelte 5 runes are new to some contributors | The guide explains the handful of runes Beacon uses (`$state`, `$derived`, `$effect`, `$props`) with examples from the codebase |

## Rough timeline

About **5–7 weeks** of part-time work before the side-by-side run, then a week or two of real use before switching:

| Phase | Effort |
|---|---|
| 0 Scaffold | 1–2 days |
| 1 Model and tests | 4–6 days |
| 2 Terrain layer | 4–5 days |
| 3 Services and shell | 3–4 days |
| 4 Pages | 8–12 days |
| 5 Side by side | 1–2 weeks of use |
| 6 Switch over | 1 day |

## Decisions to make before starting

1. **Folder name:** `web/` beside the current app (suggested), or a separate repository.
2. **Bootstrap:** keep its CSS for an identical look at first (suggested), or drop it during the port for a smaller download.
3. **Approvals actioning:** port it as read-only and add approve/improve after the switch (suggested), or wait for the Terrain request capture and build it into the new app directly.
4. **AI prompt features** on Insights and youth details: keep them as they are, or leave them out until someone asks for them.
