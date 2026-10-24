# Golden files

These are the Blazor version of Beacon's own results, saved with the inputs that produced them. The tests in `tests/unit/golden.test.ts` run the same inputs through the Svelte port and check the results are identical. This covers what gets sent to Terrain when recording and submitting OAS, and the full Insights reports.

| File                   | What it holds                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oas-recording.json`   | OAS records (including an older Joey-style one with no `last_updated`), the statements ticked, and the answers and request bodies the Blazor app builds |
| `insights.json`        | Five units and settings, with the Insights report and detail stages for each                                                                            |
| `member-insights.json` | Youth with their worksheet answers, and each one's Progress insights                                                                                    |
| `oas-reference.json`   | The OAS reference built from the Alpine tree and the Bushwalking Stage 3 template                                                                       |

All youth in them are made up.

## Regenerating

Only regenerate these from the Blazor app, never from the Svelte port, or the tests would just compare the port with itself. With the .NET 10 SDK and a checkout of [no5tyle/Beacon](https://github.com/no5tyle/Beacon):

```
cd tests/golden/generator
dotnet run -p:BlazorRepo=/path/to/Beacon -- /path/to/beacon-next
```
