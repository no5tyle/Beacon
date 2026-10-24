// Writes golden files for beacon-next: the Blazor app's own logic run on fixed inputs, saved with those inputs,
// so the Svelte port can be checked to give exactly the same results.
using System.Globalization;
using System.Reflection;
using System.Text.Json.Nodes;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;
using Topo.Model.Insights;
using Topo.Model.OAS;
using Topo.Model.Wallchart;

var root = args[0];
var fixtures = Path.Combine(root, "tests", "fixtures");
var output = Path.Combine(root, "tests", "golden");
Directory.CreateDirectory(output);
CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("en-AU");

var settingsJson = new JsonSerializerSettings
{
    ContractResolver = new WritableCamelCase(),
    Converters = { new StringEnumConverter() },
    DateFormatString = "yyyy-MM-dd",
    Formatting = Formatting.None
};
string Json(object value) => JsonConvert.SerializeObject(value, settingsJson);
void Write(string name, object value) => File.WriteAllText(Path.Combine(output, name), Json(value) + "\n");

var today = new DateTime(2026, 10, 22);

// ---- OAS recording ----
var template = JsonConvert.DeserializeObject<GetOASTemplateResultModel>(File.ReadAllText(Path.Combine(fixtures, "oas-bushwalking-3-template.json")))!;
const string First = "their_help_stage_1_pack_bushwalk_scout_backpack_ed01f4";
const string Second = "area_bushwalking_forecast_will_weather_latest_where_8f2cdd";
var verifier = new OASVerifier { Name = "Pat Leader", Contact = "pat@example.com" };

var scoutRecordText = $$"""
{
  "id": "ach-1", "member_id": "youth-1", "template": "oas/bushwalking/3", "version": 2, "section": "scout",
  "status": "in_progress", "last_updated": "2026-10-01T10:00:00.000Z",
  "achievement_meta": { "stream": "bushwalking", "branch": "bushwalking", "stage": 3 },
  "answers": { "{{First}}": true, "{{First}}_verifierName": "Alex Leader", "{{First}}_verifiedDate": "01/10/2026", "file_uploader": [] },
  "uploads": [ { "bucket": "b", "filename": "map.jpg", "key": "k", "uploaded_on": "2026-10-01" } ],
  "imported": { "date_awarded": "" }
}
""";
// An older Joey-style record ticked through an event: no last_updated or uploads, the event's leader as verifier
var joeyRecordText = $$"""
{
  "id": "ach-2", "member_id": "youth-2", "template": "oas/bushwalking/3", "version": 1, "section": "joey",
  "status": "in_progress",
  "achievement_meta": { "stream": "bushwalking", "branch": "bushwalking", "stage": 3 },
  "answers": { "{{First}}": "true", "{{First}}_verifierType": "Sam Leader", "{{First}}_verifierName": "Sam Leader", "{{First}}_verifierContact": "N/A", "{{First}}_verifiedDate": "05/03/2025", "{{First}}_eventId": "event-1" }
}
""";
var scoutRecord = JsonNode.Parse(scoutRecordText)!.AsObject();
var joeyRecord = JsonNode.Parse(joeyRecordText)!.AsObject();

var scoutStatements = OASRecording.Statements(template, scoutRecord["answers"] as JsonObject);
var scoutTicked = new[] { Second, First, OASRecording.LogbookInputId };
var scoutAnswers = OASRecording.AddVerifications(scoutRecord["answers"] as JsonObject, scoutStatements.Where(s => scoutTicked.Contains(s.InputId)).ToList(), verifier, today);
var joeyStatements = OASRecording.Statements(template, joeyRecord["answers"] as JsonObject);
var joeyTicked = new[] { First, Second };
var joeyAnswers = OASRecording.AddVerifications(joeyRecord["answers"] as JsonObject, joeyStatements.Where(s => joeyTicked.Contains(s.InputId)).ToList(), verifier, today);
var newStatements = OASRecording.Statements(template, null);
var newTicked = newStatements.Take(3).Select(s => s.InputId).Append(OASRecording.LogbookInputId).ToArray();
var newAnswers = OASRecording.AddVerifications(null, newStatements.Where(s => newTicked.Contains(s.InputId)).ToList(), verifier, today);
var stage = new OASStageListModel { Stream = "Bushwalking", Branch = "bushwalking", Stage = 3, StageTitle = "Bushwalking Stage 3", TemplateLink = "oas/bushwalking/3/latest.json" };

var recording = new JsonObject
{
    ["today"] = "2026-10-22",
    ["verifier"] = JsonNode.Parse(Json(verifier)),
    ["stage"] = JsonNode.Parse(Json(stage)),
    ["scoutRecord"] = scoutRecord.DeepClone(),
    ["joeyRecord"] = joeyRecord.DeepClone(),
    ["scoutTicked"] = new JsonArray(scoutTicked.Select(t => (JsonNode)t!).ToArray()),
    ["joeyTicked"] = new JsonArray(joeyTicked.Select(t => (JsonNode)t!).ToArray()),
    ["newTicked"] = new JsonArray(newTicked.Select(t => (JsonNode)t!).ToArray()),
    ["expected"] = new JsonObject
    {
        ["scoutStatements"] = JsonNode.Parse(Json(scoutStatements)),
        ["joeyStatements"] = JsonNode.Parse(Json(joeyStatements)),
        ["scoutAnswers"] = scoutAnswers.DeepClone(),
        ["scoutUpdateBody"] = OASRecording.UpdateBody(scoutRecord, scoutAnswers),
        ["joeyAnswers"] = joeyAnswers.DeepClone(),
        ["joeyUpdateBody"] = OASRecording.UpdateBody(joeyRecord, joeyAnswers),
        ["createBody"] = OASRecording.CreateBody(template, stage, "cub", newAnswers),
        ["submitBody"] = OASRecording.SubmitBody("unit-1", "leader-1")
    }
};
File.WriteAllText(Path.Combine(output, "oas-recording.json"), recording.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }) + "\n");

// ---- Insights ----
var wallchart = JsonConvert.DeserializeObject<List<WallchartItemModel>>(File.ReadAllText(Path.Combine(fixtures, "wallchart.json")))!;
var worksheet = JsonConvert.DeserializeObject<List<OASWorksheetAnswers>>(File.ReadAllText(Path.Combine(fixtures, "oas-worksheet.json")))!;

// The wallchart unit, with birthdays spread so some youth are moving up soon and some stages in progress
var wallchartYouth = wallchart.Select((w, i) =>
{
    w.OASStagesInProgress = i % 4 == 0 ? new List<string> { $"bushwalking/{w.OASBushwalkingStage + 1}" } : i % 5 == 0 ? new List<string> { "camping/4", "paddling/2" } : new List<string>();
    w.OASSectionStagesAwarded = Enumerable.Range(1, w.OASStageProgressions % 5).Select(n => n + 2).ToList();
    return new YouthRecord
    {
        MemberId = w.MemberId,
        MemberName = w.MemberName,
        Patrol = w.MemberPatrol,
        DateOfBirth = i % 7 == 3 ? null : today.AddYears(-15).AddMonths(i - 3).AddDays(i % 3),
        Progress = w
    };
}).ToList();

// The worksheet unit: everyone on Bushwalking Stage 2 working on Stage 3
var worksheetYouth = worksheet.GroupBy(a => a.MemberId).Select((g, i) => new YouthRecord
{
    MemberId = g.Key,
    MemberName = g.First().MemberName,
    Patrol = g.First().MemberPatrol,
    DateOfBirth = today.AddYears(-11).AddMonths(i - 2),
    Progress = new WallchartItemModel
    {
        MemberId = g.Key, OASBushwalkingStage = 2, OASBushcraftStage = 1 + i % 3, OASCampingStage = i % 4, OASAquaticsStage = i % 2,
        Milestone1Awarded = i % 3 == 0 ? today.AddYears(-1) : null, Milestone2Community = i % 6, Milestone2Outdoors = i % 5, Milestone1Lead = i % 3,
        OASStageProgressions = i % 9, SIAEnvironment = i % 4, SIAStemInnovation = i % 3,
        OASStagesInProgress = i % 3 == 1 ? new List<string> { "bushwalking/3" } : new List<string>()
    }
}).ToList();
var worksheetRequirements = worksheet.Select((a, i) => new OASRequirementStatus
{
    Stream = "bushwalking", Stage = 3, InputGroup = a.InputTitle, InputLabel = a.InputLabel, MemberId = a.MemberId, Answered = a.Answered,
    InputDetail = i % 11 == 0 ? "Explained in Terrain." : ""
}).ToList();

var insightsCases = new List<object>();
void InsightsCase(string name, string section, List<YouthRecord> youth, List<OASRequirementStatus> requirements, InsightsSettings settings, string[] focus)
{
    var report = InsightsCalculator.Build(section, youth, requirements, settings, today, focus);
    var detail = InsightsCalculator.StagesForDetail(report.NextStageDemand, report.MoveUpCandidates, youth, settings.MaxGapStages, settings.IncludeNonCoreOAS, report.MinimumStage, report.MaximumStage)
        .Select(s => new { stream = s.Stream, stage = s.Stage }).ToList();
    insightsCases.Add(new { name, section, today = "2026-10-22", youth, requirements, settings, focus, expected = report, expectedStagesForDetail = detail });
}
InsightsCase("wallchart unit, scouts", "scout", wallchartYouth, new List<OASRequirementStatus>(), new InsightsSettings(), new[] { wallchartYouth[10].MemberId });
InsightsCase("wallchart unit, venturers, every stream and stage", "venturer", wallchartYouth, new List<OASRequirementStatus>(), new InsightsSettings { IncludeNonCoreOAS = true, SectionStagesOnly = false, MoveUpWindowMonths = 12 }, Array.Empty<string>());
InsightsCase("worksheet unit, cubs", "cub", worksheetYouth, worksheetRequirements, new InsightsSettings(), new[] { worksheetYouth[5].MemberId, "not-in-unit" });
InsightsCase("worksheet unit, scouts, every stage", "scout", worksheetYouth, worksheetRequirements, new InsightsSettings { SectionStagesOnly = false, SuggestedNights = 4 }, Array.Empty<string>());
InsightsCase("worksheet unit, joeys", "joey", worksheetYouth, worksheetRequirements, new InsightsSettings { SectionStagesOnly = false, IncludeNonCoreOAS = true }, Array.Empty<string>());
Write("insights.json", insightsCases);

// ---- Member insights ----
var memberCases = new List<object>();
var scoutRules = new InsightsSettings().RulesFor("scout");
foreach (var (youth, i) in worksheetYouth.Select((y, i) => (y, i)))
{
    var requirements = worksheetRequirements.Where(r => r.MemberId == youth.MemberId).ToList();
    if (i % 4 == 2)
        requirements.Add(new OASRequirementStatus { Stream = "bushcraft", Stage = 4, InputGroup = "Do", InputLabel = "I can take a compass bearing and follow it.", MemberId = youth.MemberId });
    var started = i % 2 == 0 ? new[] { "bushwalking/3", "paddling/2" } : Array.Empty<string>();
    var startedSet = started.Select(s => (s.Split('/')[0], int.Parse(s.Split('/')[1]))).ToHashSet();
    var includeNonCore = i % 3 == 0;
    var minStage = i % 5 == 4 ? 4 : 1;
    var report = MemberInsightsCalculator.Build(youth, requirements, startedSet, scoutRules, today, includeNonCore, minStage);
    memberCases.Add(new { youth, requirements, started, rules = scoutRules, today = "2026-10-22", includeNonCoreOAS = includeNonCore, minStage, expected = report });
}
// Wallchart youth have milestone progress, birthdays near and far, and no worksheet
foreach (var youth in wallchartYouth.Take(12))
{
    var report = MemberInsightsCalculator.Build(youth, new List<OASRequirementStatus>(), new HashSet<(string, int)>(), scoutRules, today);
    memberCases.Add(new { youth, requirements = new List<OASRequirementStatus>(), started = Array.Empty<string>(), rules = scoutRules, today = "2026-10-22", includeNonCoreOAS = false, minStage = 1, expected = report });
}
Write("member-insights.json", memberCases);

// ---- OAS reference ----
var tree = JsonConvert.DeserializeObject<GetOASTreeResultsModel>(File.ReadAllText(Path.Combine(fixtures, "oas-alpine-tree.json")))!;
var referenceStage = new OASReferenceStage { Stream = "bushwalking", StreamTitle = "Bushwalking", Stage = 3, TemplateLink = "oas/bushwalking/3/latest.json" };
var referenceStatements = OASReference.Statements(referenceStage, template);
Write("oas-reference.json", new
{
    alpineStages = OASReference.Stages(tree),
    bushwalking3Statements = referenceStatements,
    filtered = new
    {
        unitNight = OASReference.Filter(referenceStatements, new OASReferenceFilter { Where = OASReferenceWhere.UnitNight }).Select(s => s.Key),
        searchMap = OASReference.Filter(referenceStatements, new OASReferenceFilter { Search = "map plan" }).Select(s => s.Key),
        doNavigation = OASReference.Filter(referenceStatements, new OASReferenceFilter { Part = "Do", Theme = "Navigation & Maps" }).Select(s => s.Key)
    },
    checklist = OASReference.ChecklistText(referenceStatements, "Unit night")
});
Console.WriteLine("golden files written to " + output);

// Camel case names, and only properties with setters, so worked-out values like Count are left out
class WritableCamelCase : CamelCasePropertyNamesContractResolver
{
    protected override IList<JsonProperty> CreateProperties(Type type, MemberSerialization memberSerialization)
    {
        var properties = base.CreateProperties(type, memberSerialization);
        // Anonymous types have no setters but are written as they are
        if (type.Name.Contains("AnonymousType"))
            return properties;
        return properties.Where(p => p.Writable).ToList();
    }
}
