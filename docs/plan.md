# Rebuilding Beacon in Svelte

Beacon is a Blazor WebAssembly app. This plan moves it to **Svelte 5 + SvelteKit + TypeScript** in a **new repository**, so that:

- **Contributing is easier.** Scout leaders who code are far more likely to know JavaScript or TypeScript than C# and Razor. Running Svelte needs Node and nothing else.
- **The app is web native.** Home Screen install, safe areas, dark mode, pull to refresh, password autofill and the service worker are all browser features. In Svelte they're used directly, with no calls between C# and JavaScript.
- **The first open is faster.** Without Blazor or Bootstrap, a build should be well under 300 KB. The current app downloads about 4 MB.

Beacon keeps working exactly as it does today throughout the move. The new app is built in its own repository and only takes over once it does everything the current one does.

## Decisions

| Question             | Decision                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Where the code lives | A new repository. The current `no5tyle/Beacon` is archived at the switch                                        |
| Bootstrap            | Dropped. Beacon gets its own small stylesheet built on its existing theme variables                             |
| Approvals            | Not built for now. The tab, page and pending-approvals logic are left out; the More menu has logging and Logout |
| AI prompt features   | Dropped from Insights and youth details, with their builders and tests                                          |

## Ground rules

1. **Same behaviour first, improvements after.** Each page is ported to match what Beacon does today, apart from the decisions above, with no redesign along the way. Changes come after the switch, so a difference is always a bug.
2. **Logic and its tests move before any page.** The Insights, OAS recording and sign off rules move to plain TypeScript with no Svelte in them, along with their tests. That way the parts that write to Terrain are proven identical before anything uses them.
3. **Nothing new is stored.** Passwords and tokens are still never kept on the device. Only the same preferences as today are stored: branch, chosen unit, focus youth and similar.
4. **Writes to Terrain stay byte-for-byte the same.** Saving, creating and submitting OAS records, and switching to act as a youth, must send exactly what the current app sends. Tests compare request bodies against the C# output.

## Stack

| Part            | Choice                                                                                                | Why                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Framework       | Svelte 5 (runes)                                                                                      | HTML-first components, built-in form binding, scoped styles like today's `.razor.css`                       |
| App framework   | SvelteKit with `adapter-static`                                                                       | Routing and the static build for GitHub Pages; `ssr = false`, so it runs entirely in the browser like today |
| Language        | TypeScript (strict)                                                                                   | Keeps Terrain's data shapes and the OAS rules type-checked, as C# does now                                  |
| Build           | Vite (comes with SvelteKit)                                                                           | Fast dev server with hot reload                                                                             |
| Unit tests      | Vitest                                                                                                | The ported versions of the current MSTest suite                                                             |
| Page tests      | Playwright with a fake Terrain                                                                        | Builds on the harness used during Beacon's development: mocked Terrain routes, phone viewport               |
| Lint and format | ESLint + Prettier + `svelte-check`                                                                    | One command a contributor runs before pushing                                                               |
| Styling         | Beacon's own CSS: theme variables (light and dark), a few layout helpers, and scoped component styles | No Bootstrap. Only the handful of pieces Beacon uses (buttons, form fields, chips, cards, alerts, tabs)     |
| Icons           | Open Iconic SVGs, inlined                                                                             | Same icons as today, without an icon font                                                                   |
| PWA             | SvelteKit service worker + the two existing manifests                                                 | Same install behaviour, Beacon and Beacon Reference as separate apps                                        |

There are no other runtime dependencies to begin with. Each one added later needs a reason in its pull request.

## Repository layout

```
src/
  lib/
    terrain/                    talking to Terrain (no Svelte)
      client.ts                 fetch wrapper: auth header, token refresh, logging, error wording
      auth.ts                   Cognito login and refresh, branch → client id
      profileGate.ts            reads in parallel; acting as a youth runs alone
      members.ts  achievements.ts  templates.ts  events.ts  metrics.ts
      types.ts                  Terrain's response shapes (from the C# models)
    model/                      Beacon's rules (no Svelte, no fetch)
      insights/                 insightsCalculator, memberInsightsCalculator, skillThemes
      oas/                      recording, signOff, reference
    services/                   the C# services: caching, preloading, combining Terrain data
    stores/                     session, chosen unit, preferences, logging (Svelte runes)
    components/                 TabBar, MoreMenu, ChooseUnit, InstallHint, PullToRefresh, Preloader,
                                OASReferenceView, Button, Chip, Card, Alert, Tabs, Field
    styles/                     theme.css (variables, light and dark), base.css, layout.css
  routes/
    +layout.svelte              tab bar, sign-in guard, preloader
    +layout.ts                  ssr = false, prerender the shell
    login/  (home)/  insights/  oas/sign-off/  progress/  progress/[memberId]/
    progress/[memberId]/record-oas/  oas-reference/  logging/  reference/
  service-worker.ts
static/                         icons, both manifests, reference/
tests/
  unit/                         Vitest, ported from TopoInsightsTest
  e2e/                          Playwright against a fake Terrain
  golden/                       Terrain request bodies produced by the current app
```

The `lib/terrain` and `lib/model` folders never import Svelte. Their logic can be read, tested and reused without knowing the framework.

## Addresses and the switch

GitHub Pages serves each repository at its own address, so:

- **During the rebuild,** the new repository (e.g. `no5tyle/beacon-next`) publishes to `https://no5tyle.github.io/beacon-next/`. That's the side-by-side test address.
- **At the switch,** the current repository is renamed (e.g. to `Beacon-blazor`) and archived, and the new one is renamed to `Beacon`. The site address stays `https://no5tyle.github.io/Beacon/`, so Home Screen installs and bookmarks keep working.
- The base path comes from the repository name at build time, as it does today, so nothing needs changing in the code when the repository is renamed.

## Phases

Each phase ends with something that can be checked. Nothing affects the live app until Phase 6.

### Phase 0: Scaffold (2–3 days)

- Create the repository with SvelteKit, TypeScript, Vitest, Playwright, ESLint, Prettier and `adapter-static`.
- Build Beacon's own stylesheet from the existing theme variables, light and dark. It covers base type, buttons, form fields and selects, checkboxes, chips, cards, alerts, tabs and the stacked list and table layouts. Each gets a small Svelte component where that helps.
- Copy over the icons and both manifests.
- GitHub Actions: on every push to `main`, run `npm ci`, `npm run check`, `npm test` and `npm run build`, then publish to GitHub Pages. The daily Terrain check moves here too.
- Write `README.md` and `CONTRIBUTING.md`: install Node, `npm install`, `npm run dev`, and how to run the tests.

**Done when:** the published address shows an empty Beacon shell with the tab bar in light and dark mode, and CI is green.

### Phase 1: Model logic and tests (3–5 days)

Port the parts of `Model/` that Beacon keeps, each with its tests:

| C#                                                                           | TypeScript                             | Tests to port   |
| ---------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| `Insights/InsightsCalculator.cs`, `InsightsModels.cs`, `InsightsSettings.cs` | `insights/insightsCalculator.ts`       | 23              |
| `Insights/MemberInsightsCalculator.cs`, `MemberInsightsModels.cs`            | `insights/memberInsightsCalculator.ts` | 9               |
| `Insights/SkillThemeClassifier.cs`                                           | `insights/skillThemes.ts`              | (covered above) |
| `OAS/OASRecording.cs`                                                        | `oas/recording.ts`                     | 8               |
| `OAS/OASSignOff.cs`                                                          | `oas/signOff.ts`                       | 6               |
| `OAS/OASReference.cs`                                                        | `oas/reference.ts`                     | 6               |

That's 52 tests. Not ported:

- `NightPromptBuilder`, `PlanPromptBuilder` and their 10 tests (prompt features dropped)
- `PendingApproval` and its 3 tests (approvals not built)

Plus **golden tests for the write bodies**. For a set of saved Terrain records, especially older Joey records with no `last_updated`, the current app's `CreateBody`, `UpdateBody`, `AddVerifications` and `SubmitBody` output is saved as JSON files in `tests/golden/`. The TypeScript versions must produce identical JSON.

**Done when:** all 52 ported tests and the golden tests pass.

### Phase 2: Terrain layer (4–5 days)

- `client.ts`: one fetch wrapper with the `authorization` header, token refresh, request logging for the Logging page, and the existing wording for refusals ("Terrain turned the request away without saying why, or there was no signal.").
- `auth.ts`: Cognito login per branch, refresh, and getting the user and profiles.
- `profileGate.ts`: reads run in parallel, but while Beacon is acting as a youth nothing else may reach Terrain. In TypeScript this is a small async lock in place of `AsyncLocal`. Tests cover a preload running during a sign off.
- Typed functions for each endpoint the kept pages use: members, unit and member achievements (OAS, milestones, SIAs, intro, peak award parts), OAS tree and templates, events, logbook metrics, assume and revoke profiles, create, update and submit-on-behalf.
- **Left out:** submissions and approvals, plus the endpoints only the culled reports used (calendars, additional awards, group life, logbook detail and others).

**Done when:** unit tests against a fake `fetch` pass for login, token refresh, the profile gate and every write. The write tests reuse the Phase 1 golden files.

### Phase 3: Services and app shell (3–4 days)

- Port `StorageService`, `MembersService`, `ProgressService`, `WallchartService`, `InsightsService`, `OASService`, `OASRecordingService`, `OASReferenceService` and `PreloadService` into `services/` and `stores/`. That includes caching per unit, the shared in-flight loads with progress reporting, and stopping work on logout.
- Shell: `+layout.svelte` with the tab bar (Home, Insights, Record, Progress, Reference, More), the More menu (logging, Logout, version), sign-in guard, preloader, safe-area handling and pull to refresh.
- Login page: remembered branch, the autofill auto-login (detected by `:autofill`), the diagnostics panel, the version line and the install hint.
- Home: the group and unit selectors. Changing the unit scopes every page, as today. The help text no longer mentions Approvals.

**Done when:** you can log in against the fake Terrain, pick a unit, move between tabs and log out. The Playwright tests for login, autofill and unit choice pass at phone and desktop widths.

### Phase 4: Pages (9–13 days)

Ported one at a time, most used first. Each page gets a Playwright test that works through it like a leader at a phone screen.

| Order | Page                                                 | Notes                                                                                                    |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1     | Record OAS (`/oas/sign-off`)                         | Steps, patrol filter, verifier, results, submit for review. The most important page to get exactly right |
| 2     | Progress list and youth details                      | Clickable cards; details with insights and activity ideas (no AI prompt)                                 |
| 3     | Record one youth's OAS (`/progress/[id]/record-oas`) | Save and submit for a single youth                                                                       |
| 4     | Insights                                             | Stat tiles, OAS gaps heatmap, priority and programming tabs, filters panel, refresh (no AI prompt)       |
| 5     | Reference and the Beacon Reference app               | Shared view, offline saving, starred statements, separate manifest and service worker                    |
| 6     | Logging                                              | Turn on and off, download the log                                                                        |

Dropping Bootstrap adds a little time here, since each page's layout is written with Beacon's own styles rather than Bootstrap classes.

**Done when:** every page passes its Playwright test, and screenshots of each page at 390 px wide match today's closely in light and dark mode. Spacing and fonts may differ slightly without Bootstrap; layout and content should not.

### Phase 5: Side by side (1–2 weeks of real use)

- You, and any leaders willing to help, use the new repository's address on a real unit night: sign offs for Joeys, Cubs and Scouts, a submit for review, Insights before programming.
- Anything that differs gets fixed, or noted as an intended change for after the switch.
- Fixes needed in the meantime still go into the current app as usual, with a matching item added to the checklist below.

**Done when:** a full unit night has run on the new app with no fallback to the current one, and every item on the parity checklist below is ticked.

### Phase 6: Switch over (half a day)

1. Rename `no5tyle/Beacon` (e.g. to `Beacon-blazor`), add a README note pointing to the new repository, and archive it. Renaming and archiving the current repository needs your confirmation at the time.
2. Rename the new repository to `Beacon` and run its deploy, so it publishes to `https://no5tyle.github.io/Beacon/`.
3. Check that an app already installed from the current Beacon opens the new one. The manifest `id`, `start_url` and scope stay the same, and the new service worker clears the old `topo-app-` caches.

**Done when:** the live site is the Svelte app, and installed apps opened from the Home Screen load it.

## Parity checklist

These are the features to tick off in Phase 5. Ticked items are covered by the automated tests and checks (unit tests, page tests against a fake Terrain, and the daily Terrain check). The rest need a real phone, real Terrain or both; [the field test](field-test.md) walks through them.

- [ ] Login: branch remembered, autofill auto-login on iOS and Android, version line, diagnostics panel, errors (all but the real autofill on iOS and Android are page tested)
- [x] Signed out goes to login; youth members see only Home, Progress and Reference
- [x] Home: group and unit selectors, unit remembered, help text, link to Topo
- [x] Tab bar: Home, Insights, Record, Progress, Reference, More; More has logging, Logout and the version
- [x] Background preload of the unit's progress once a unit is chosen
- [x] Insights: tiles, heatmap with stream drill-down, priority and programming tabs, filters, focus youth, refresh
- [ ] Record OAS: streams and stages, statements, youth states (to add / already done / locked), patrol filter, verifier, per-youth results, submit ready stages (page tested; needs a real sign off)
- [x] Leaders can't verify stages above 5; only the logbook can be ticked there
- [ ] Joey records without `last_updated` save correctly (golden test and page test done; needs a real save)
- [ ] Progress list, youth details, single-youth record and submit (page tested; needs a real save and submit)
- [ ] Reference: filters, search, starred, share links; Beacon Reference installs separately and works offline (filters, search, starred and share links page tested; install and offline need a phone)
- [x] Logging: turn on and off, download
- [ ] Pull to refresh on Insights and Progress; the browser's own pull to refresh is off while signed in (needs a phone)
- [x] Dark mode follows the phone; printing stays light
- [ ] Install hint, and the Home Screen install of both apps (needs a phone)
- [ ] Safe areas on phones with notches and rounded corners (needs a phone)
- [x] The daily Terrain check runs from the new repository

### Intended changes

Differences from the current app that are on purpose, so they aren't reported as bugs:

- No Bootstrap, approvals or AI prompts, as decided in the plan.
- When Terrain won't renew the login, Beacon now signs out and the login page says the Terrain login expired. The current app carried on and pages failed to load.
- Beacon Reference saves Terrain's public OAS templates for offline use through Beacon's one service worker, rather than a second one of its own.

- Statements verified on a stage that is still `in_progress` (as leaders' saves leave it) now count as done in Insights and a youth's outstanding requirements. The current app only counted them once the stage was submitted.
- An awarded stage's logbook check counts as done even when the record doesn't list it.

New in this app:

- Approvals is back, under More for leaders: the unit's submissions waiting for the Unit Council, filtered by youth and grouped by achievement or youth, with an Approve button (after a confirm) where Terrain says the leader may approve, and, in a separate Ready to award section, those the Unit Council has approved, ticked and awarded together with one date. The approval that sends a special interest area plan through can also move it on to the review for the youth. A History tab lists what the Unit Council has finished with: the last 90 days, and older on request. Asking for improvement will follow once Terrain's request for it has been captured.
- Record has Log activity (a unit night, outing, camp or hike: details, who came and in what role, and nights camped and kilometres hiked for their logbooks) and SIA plan (a youth's area and project name). Log activity takes only activities that are over, and saves each to the unit's programme already concluded, with its review (rating, tags, Scout method and SPICES) so those who came get credit. A camp's or overnight hike's nights come from its dates and count towards camping, and the kilometres walked go in everyone's logbook, as Terrain logs them. SIA plan is a form only for now.
- Tapping a stage in the Insights heatmap opens that stage's analysis: its statements ranked for youth who have it as their next stage (finishing the stage and priority youth count most), grouped by theme, with a patrol filter and "Sign these off", which opens Record OAS with the statements and youth picked.

## How contributing will work

```
npm install
npm run dev          # http://localhost:5173, hot reload
npm test             # unit tests
npm run test:e2e     # page tests against a fake Terrain, no Terrain login needed
npm run check        # types, lint and format
```

The fake Terrain used by the page tests also powers a `npm run dev:demo` mode. It runs the whole app with the made-up "Mt Example Scouts" unit, so contributors can work on pages without a Terrain account or touching real youth records.

## Risks

| Risk                                                                     | How it's handled                                                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| A write to Terrain differs subtly and corrupts or loses a youth's record | Golden tests on every write body (Phase 1), a single shared write path, and a real Joey/Cub/Scout save in Phase 5 before switching |
| Two things reach Terrain at once while it's acting as a youth            | The profile gate is ported with tests covering a preload during a sign off                                                         |
| Installed Home Screen apps break at the switch                           | Same address after the repository swap; same manifest `id`, `start_url` and scope; old caches cleared by the new service worker    |
| The repository swap goes wrong partway                                   | The current repository is renamed and archived, never deleted, so renaming it back restores the old site                           |
| The rewrite drags on while the current app needs fixes                   | Fixes go into the current app as usual, each added to the parity checklist                                                         |
| Pages look rougher without Bootstrap                                     | The base stylesheet and components are built first (Phase 0) and checked in light and dark mode before any page uses them          |
| Svelte 5 runes are new to some contributors                              | The guide explains the handful of runes Beacon uses (`$state`, `$derived`, `$effect`, `$props`) with examples from the codebase    |

## Rough timeline

About **6–8 weeks** of part-time work before the side-by-side run, then a week or two of real use before switching:

| Phase                 | Effort           |
| --------------------- | ---------------- |
| 0 Scaffold and styles | 2–3 days         |
| 1 Model and tests     | 3–5 days         |
| 2 Terrain layer       | 4–5 days         |
| 3 Services and shell  | 3–4 days         |
| 4 Pages               | 9–13 days        |
| 5 Side by side        | 1–2 weeks of use |
| 6 Switch over         | half a day       |

## Later

These come after the switch, once the new app is the live one:

- Approvals: the pending list, then approve and improve once Terrain's request has been captured.
- Anything noted as an intended change during the side-by-side run.
