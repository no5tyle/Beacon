# Beacon

*Lighting the way through the Terrain.*

Beacon is a phone-first helper for Scouts Australia leaders. It reads your unit's records from [Terrain](https://terrain.scouts.com.au) and turns them into the things you need at the hall: who's close to finishing what, what to programme next, and quick OAS sign offs after a unit night.

It runs in the browser at **https://no5tyle.github.io/Beacon/** and can be added to your phone's Home Screen to open like an app.

<p align="center">
  <img src="docs/screenshots/insights.png" width="240" alt="Insights showing OAS completion across the unit">
  <img src="docs/screenshots/record-youth.png" width="240" alt="Record OAS: choosing youth for the statements">
  <img src="docs/screenshots/dark-insights.png" width="240" alt="Insights in dark mode">
</p>

Beacon started as a fork of [Topo](https://github.com/NomisNostab/Topo-Blazor). Topo is built around desktop reports (wallcharts, patrol lists, sign in sheets); Beacon drops those and focuses on what's useful on a phone. Use [Topo](https://nomisnostab.github.io/Topo-Blazor/) when you need a printable report.

## What's in it

Log in with your Terrain member number and password. If you lead more than one unit, pick the unit on **Home**; every page then works on that unit, and it's remembered next time.

| Tab | What it does |
|---|---|
| **Home** | Choose your group and unit. |
| **Insights** | The unit at a glance: OAS completion by stream and stage, the most common missing OAS requirements, youth moving up soon (plus any focus youth you pick) with their peak award progress, and skill themes and milestone gaps to programme around. Settings are under the Filters icon. |
| **Record** | Sign off the same OAS I statements for several youth at once: pick a stage and the statements, pick the youth (or a whole patrol), then save. Each youth shows whether the statements are new for them, already done, or locked because the stage is submitted or awarded. Anyone left with the whole stage done can then be submitted for Unit Council review in one tap. |
| **Progress** | Each youth's milestones, OAS, SIAs and peak award, with what they're missing and activity ideas for anything they're close to completing. From here you can also record one youth's statements and submit a stage for Unit Council review on their behalf. |
| **Reference** | Every OAS I statement with Terrain's full explanation, searchable and filterable. |
| **More** | Approvals (what's currently waiting for the Unit Council, with votes so far), logging for troubleshooting, and Logout. |

Youth members can log in too and see their own progress.

Pull down from the top of Insights, Progress or Approvals to fetch the latest from Terrain. Beacon follows your phone's light or dark setting.

## A look around

All screenshots use made-up youth in a made-up unit.

### Logging in and choosing a unit

| Log in | Home |
|:---:|:---:|
| <img src="docs/screenshots/login.png" width="240" alt="Login page"> | <img src="docs/screenshots/home.png" width="240" alt="Home page with group and unit selectors"> |
| Your phone's password manager can fill this in, and Beacon logs in as soon as it does. | Pick your group and unit; every other tab works on that unit. |

### Insights

| OAS gaps | Priority | Programming |
|:---:|:---:|:---:|
| <img src="docs/screenshots/insights.png" width="240" alt="Insights OAS gaps tab"> | <img src="docs/screenshots/insights-priority.png" width="240" alt="Insights priority tab"> | <img src="docs/screenshots/insights-programming.png" width="240" alt="Insights programming tab"> |
| How many youth have each stage of each stream. Tap a stream to see who is stuck where. | Peak award items still outstanding for youth moving up soon, most urgent first. | Skill themes that come up across outstanding statements, to build unit nights around. |

### Record OAS at a unit night

| 1. Statements | 2. Youth | 3. Save | 4. Done |
|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/record-statements.png" width="200" alt="Choosing a stage and its I statements"> | <img src="docs/screenshots/record-youth.png" width="200" alt="Choosing youth, with patrol filters"> | <img src="docs/screenshots/record-review.png" width="200" alt="Reviewing before saving, with the verifier details"> | <img src="docs/screenshots/record-results.png" width="200" alt="Results, with youth ready to submit for review"> |
| Pick the stream, stage and the statements the activity covered. | Pick the youth, or narrow to a patrol. Youth who already have the statements, or whose stage is locked, can't be picked. | Check it over. You're recorded as the verifier. | Beacon saves each youth in turn, then offers to submit anyone whose stage is now complete. |

### Progress

| The unit | One youth |
|:---:|:---:|
| <img src="docs/screenshots/progress.png" width="240" alt="Progress list of youth"> | <img src="docs/screenshots/progress-details.png" width="240" alt="One youth's progress"> |
| Tap a youth to open their progress. | Milestones, OAS, SIAs and peak award progress, what's missing, and activity ideas. Record or submit their OAS from here too. |

### Reference, Approvals and More

| Reference | Approvals | More |
|:---:|:---:|:---:|
| <img src="docs/screenshots/reference.png" width="240" alt="OAS reference"> | <img src="docs/screenshots/approvals.png" width="240" alt="Pending approvals with votes so far"> | <img src="docs/screenshots/more.png" width="240" alt="More menu"> |
| Every OAS I statement with Terrain's explanation. Search or filter by stream, stage and skill theme. | What's waiting for the Unit Council, with who has voted so far. Filter by youth or group by youth. | Approvals, logging and Logout. |

### Dark mode

| Insights | Record OAS |
|:---:|:---:|
| <img src="docs/screenshots/dark-insights.png" width="240" alt="Insights in dark mode"> | <img src="docs/screenshots/dark-record-youth.png" width="240" alt="Record OAS in dark mode"> |

**Beacon Reference** is the OAS reference on its own, as a separate installable app that also works offline (handy at camp): https://no5tyle.github.io/Beacon/reference/

## Installing on a phone

Open https://no5tyle.github.io/Beacon/ and:

- **iPhone / iPad:** tap Share, then *Add to Home Screen*.
- **Android (Chrome):** tap *Install* in the hint on the login page, or *Install app* in Chrome's menu.

Do the same from the `/reference/` address to add Beacon Reference as its own app.

## How it works

- **No Beacon server.** Beacon runs entirely in your browser and talks straight to Terrain with your own login, so it can only see and change what your Terrain account can.
- **What's kept on your device:** your branch, chosen unit, Insights focus youth and similar preferences, plus the offline copy of Beacon's own files. Your password isn't stored (let your phone's password manager remember it; Beacon logs in as soon as it's filled). Youth records are only held in memory while Beacon is open.
- **Background loading.** Once you're logged in and a unit is chosen, Beacon quietly loads every youth's progress so Insights opens straight away.
- **Writing to Terrain.** Record OAS adds I statement verifications in Terrain using the same requests Terrain's own app sends when a leader records on a youth's behalf. It only ever adds statements a youth doesn't already have, never changes existing answers, and only submits a stage when you ask it to. The Unit Council still approves in Terrain.

### Things to know

- Terrain has no public API. Beacon uses the same requests Terrain's own app makes, so a change to Terrain can break things until Beacon is updated. A daily check (`.github/workflows/check-terrain.yml`) looks for changes to Terrain's OAS templates and fails, emailing the repository owner, if they no longer look as Beacon expects. Beacon isn't made or supported by Scouts Australia.
- Approving or marking submissions for improvement from Beacon isn't available yet; use Terrain for that.
- Leaders can't verify Stage 6 and above OAS statements (Terrain's rule), so Beacon only offers the logbook tick there.

## Development

Beacon is a .NET 10 Blazor WebAssembly app.

```
dotnet build Topo/Topo.csproj
dotnet run --project Topo/Topo.csproj     # http://localhost:5064
dotnet test TopoInsightsTest              # Insights, OAS recording, sign off and approvals logic
```

| Folder | Contents |
|---|---|
| `Topo/` | The app: pages, services that call Terrain, styles and the two web app manifests |
| `Model/` | Models and the logic for Insights, OAS recording, sign off and approvals (covered by `TopoInsightsTest`) |
| `TopoInsightsTest/` | Unit tests |
| `docs/screenshots/` | The screenshots in this README |
| `TopoReportFunction/`, `Services/` | Topo's PDF/XLSX report service, kept from the original project but not used by Beacon |

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/main.yml`); the site's address follows the repository name.

The code and project names still use the original Topo name.

The original project's [wiki](https://github.com/NomisNostab/Topo-Blazor/wiki) documents Topo's features.
