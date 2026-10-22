using Topo.Model.Insights;

namespace Topo.Model.OAS
{
    // A browsable reference of every OAS I statement, built from Terrain's public templates.
    // Nothing here relates to any youth member.
    public static class OASReference
    {
        public const string VerifiableCheckbox = "verifiable_checkbox";
        public static readonly string[] Parts = { "Plan", "Do", "Review" };

        // Every stage in a stream's tree, including each branch of the higher stages
        public static List<OASReferenceStage> Stages(GetOASTreeResultsModel tree)
        {
            var stages = new List<OASReferenceStage>();
            void Add(string branchId, string title, int stage, string templateLink, IEnumerable<Child>? children)
            {
                if (!string.IsNullOrEmpty(templateLink))
                {
                    stages.Add(new OASReferenceStage
                    {
                        Stream = tree.stream_id,
                        StreamTitle = tree.title,
                        Branch = branchId,
                        BranchTitle = title == tree.title ? "" : title,
                        Stage = stage,
                        TemplateLink = templateLink
                    });
                }
                foreach (var child in children ?? Enumerable.Empty<Child>())
                    Add(child.branch_id, child.title, child.stage, child.template_link, child.children);
            }
            Add(tree.tree.branch_id, tree.tree.title, tree.tree.stage, tree.tree.template_link, tree.tree.children);
            return stages
                .GroupBy(s => s.TemplateLink)
                .Select(g => g.First())
                .OrderBy(s => s.Stage)
                .ThenBy(s => s.BranchTitle)
                .ToList();
        }

        public static List<OASReferenceStatement> Statements(OASReferenceStage stage, GetOASTemplateResultModel template)
        {
            var statements = new List<OASReferenceStatement>();
            var order = 0;
            foreach (var document in template.document)
            {
                foreach (var group in document.input_groups)
                {
                    var part = group.title.Replace(">", "").Trim();
                    foreach (var input in group.inputs.Where(i => i.type == VerifiableCheckbox))
                    {
                        statements.Add(new OASReferenceStatement
                        {
                            Stage = stage,
                            Order = order++,
                            InputId = input.id ?? "",
                            Part = part,
                            Label = input.label ?? "",
                            Detail = (input.dialog_text ?? "").Trim(),
                            Theme = SkillThemeClassifier.Classify(part, input.label ?? ""),
                            UnitNightSuitable = SkillThemeClassifier.IsUnitNightSuitable(part, input.label ?? "")
                        });
                    }
                }
            }
            return statements;
        }

        public static List<OASReferenceStatement> Filter(IEnumerable<OASReferenceStatement> statements, OASReferenceFilter filter)
        {
            var words = (filter.Search ?? "")
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            return statements
                .Where(s => filter.Keys == null || filter.Keys.Contains(s.Key))
                .Where(s => !filter.Streams.Any() || filter.Streams.Contains(s.Stage.Stream))
                .Where(s => !filter.Stages.Any() || filter.Stages.Contains(s.Stage.Stage))
                .Where(s => string.IsNullOrEmpty(filter.Part) || s.Part == filter.Part)
                .Where(s => string.IsNullOrEmpty(filter.Theme) || s.Theme == filter.Theme)
                .Where(s => filter.Where == OASReferenceWhere.Any
                    || (filter.Where == OASReferenceWhere.UnitNight && s.UnitNightSuitable)
                    || (filter.Where == OASReferenceWhere.Outing && !s.UnitNightSuitable))
                .Where(s => words.All(w => s.Label.Contains(w, StringComparison.OrdinalIgnoreCase)
                    || s.Detail.Contains(w, StringComparison.OrdinalIgnoreCase)
                    || s.Stage.Title.Contains(w, StringComparison.OrdinalIgnoreCase)))
                .OrderBy(s => InsightsCalculator.Streams.FindIndex(x => x.Key == s.Stage.Stream))
                .ThenBy(s => s.Stage.Stage)
                .ThenBy(s => s.Stage.BranchTitle)
                .ThenBy(s => s.Order)
                .ToList();
        }

        // The stream a statement key belongs to, e.g. "alpine" from "alpine/snowboarding/5:id"
        public static string StreamOfKey(string key) => key.Split('/', ':')[0];

        // Plain text checklist for sharing, grouped by stage in the order given
        public static string ChecklistText(IEnumerable<OASReferenceStatement> statements, string heading)
        {
            var text = new System.Text.StringBuilder(heading);
            foreach (var stage in statements.GroupBy(s => s.Stage.Title))
            {
                text.Append("\n\n").Append(stage.Key);
                foreach (var statement in stage)
                    text.Append("\n☐ ").Append(statement.Label);
            }
            return text.ToString();
        }
    }

    // The reference's filters as a link, so a view or a single statement can be shared
    public class OASReferenceLink
    {
        public string Stream { get; set; } = "";
        public List<int> Stages { get; set; } = new List<int>();
        public string Part { get; set; } = "";
        public string Theme { get; set; } = "";
        public OASReferenceWhere Where { get; set; } = OASReferenceWhere.Any;
        public string Search { get; set; } = "";
        public string Statement { get; set; } = "";
        public bool Starred { get; set; }

        public string ToQuery()
        {
            var parts = new List<string>();
            void Add(string name, string value)
            {
                if (!string.IsNullOrEmpty(value))
                    parts.Add($"{name}={Uri.EscapeDataString(value)}");
            }
            Add("s", Statement);
            Add("stream", Stream);
            Add("stage", string.Join(",", Stages.OrderBy(s => s)));
            Add("part", Part);
            Add("theme", Theme);
            Add("where", Where == OASReferenceWhere.Any ? "" : Where.ToString());
            Add("q", Search);
            Add("view", Starred ? "starred" : "");
            return parts.Any() ? "?" + string.Join("&", parts) : "";
        }

        public static OASReferenceLink Parse(string query)
        {
            var link = new OASReferenceLink();
            foreach (var pair in (query ?? "").TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var bits = pair.Split('=', 2);
                var value = bits.Length > 1 ? Uri.UnescapeDataString(bits[1].Replace('+', ' ')) : "";
                switch (bits[0])
                {
                    case "s": link.Statement = value; break;
                    case "stream": link.Stream = value; break;
                    case "stage":
                        link.Stages = value.Split(',').Select(v => int.TryParse(v, out var n) ? n : 0).Where(n => n > 0).Distinct().ToList();
                        break;
                    case "part": link.Part = value; break;
                    case "theme": link.Theme = value; break;
                    case "where": link.Where = Enum.TryParse<OASReferenceWhere>(value, out var where) ? where : OASReferenceWhere.Any; break;
                    case "q": link.Search = value; break;
                    case "view": link.Starred = value == "starred"; break;
                }
            }
            return link;
        }
    }

    public class OASReferenceStage
    {
        public string Stream { get; set; } = string.Empty;
        public string StreamTitle { get; set; } = string.Empty;
        public string Branch { get; set; } = string.Empty;
        // Empty for stages that aren't on a separate branch
        public string BranchTitle { get; set; } = string.Empty;
        public int Stage { get; set; }
        public string TemplateLink { get; set; } = string.Empty;
        // The template link without its folder and file, e.g. "alpine/snowboarding/5"
        public string Path => TemplateLink.Replace("oas/", "").Replace("/latest.json", "");
        public string Title => string.IsNullOrEmpty(BranchTitle) ? $"{StreamTitle} Stage {Stage}" : $"{StreamTitle} · {BranchTitle} Stage {Stage}";
    }

    public class OASReferenceStatement
    {
        public OASReferenceStage Stage { get; set; } = new OASReferenceStage();
        public int Order { get; set; }
        public string InputId { get; set; } = string.Empty;
        public string Part { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Detail { get; set; } = string.Empty;
        public string Theme { get; set; } = string.Empty;
        public bool UnitNightSuitable { get; set; }
        // Stable across sessions, so it can be starred or shared, e.g. "bushwalking/3:help_plan_bushwalking_balanced_menu_542939"
        public string Key => $"{Stage.Path}:{InputId}";
    }

    public enum OASReferenceWhere
    {
        Any,
        UnitNight,
        Outing
    }

    public class OASReferenceFilter
    {
        // When set, only these statements, e.g. the starred list
        public HashSet<string>? Keys { get; set; }
        public HashSet<string> Streams { get; set; } = new HashSet<string>();
        // Empty means every stage
        public HashSet<int> Stages { get; set; } = new HashSet<int>();
        public string Part { get; set; } = string.Empty;
        public string Theme { get; set; } = string.Empty;
        public OASReferenceWhere Where { get; set; } = OASReferenceWhere.Any;
        public string Search { get; set; } = string.Empty;
    }
}
