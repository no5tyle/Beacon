using Microsoft.AspNetCore.Components;
using Topo.Model.Insights;
using Topo.Model.OAS;
using Topo.Services;

namespace Topo.Controller
{
    public class OASReferenceController : ComponentBase
    {
        [Inject]
        public IOASReferenceService _referenceService { get; set; }

        public const string CoreStreams = "core";
        public const string AllStreams = "all";
        // Showing thousands of statements at once makes the page slow, so the list is capped
        public const int DisplayLimit = 300;

        public string streamChoice = CoreStreams;
        public HashSet<int> stages = new HashSet<int>();
        public string part = "";
        public string theme = "";
        public OASReferenceWhere where = OASReferenceWhere.Any;
        public string search = "";
        public string loadingMessage = "";
        public HashSet<string> expanded = new HashSet<string>();

        protected override async Task OnInitializedAsync()
        {
            await LoadChosenStreams();
        }

        internal IEnumerable<string> ChosenStreams => streamChoice switch
        {
            CoreStreams => InsightsCalculator.Streams.Where(s => s.IsCore).Select(s => s.Key),
            AllStreams => InsightsCalculator.Streams.Select(s => s.Key),
            _ => new[] { streamChoice }
        };

        internal async Task StreamChange(ChangeEventArgs e)
        {
            streamChoice = e.Value?.ToString() ?? CoreStreams;
            await LoadChosenStreams();
        }

        private async Task LoadChosenStreams()
        {
            foreach (var stream in ChosenStreams.Where(s => !_referenceService.IsLoaded(s)))
            {
                var title = InsightsCalculator.StreamDisplay(stream);
                await _referenceService.LoadStream(stream, (done, total) =>
                {
                    loadingMessage = $"Loading {title}: {done} of {total} stages";
                    StateHasChanged();
                });
            }
            loadingMessage = "";
        }

        internal OASReferenceFilter Filter => new OASReferenceFilter
        {
            Streams = ChosenStreams.ToHashSet(),
            Stages = stages.ToHashSet(),
            Part = part,
            Theme = theme,
            Where = where,
            Search = search
        };

        internal List<OASReferenceStatement> Results => OASReference.Filter(_referenceService.LoadedStatements, Filter);

        internal List<string> Themes => _referenceService.LoadedStatements
            .Where(s => ChosenStreams.Contains(s.Stage.Stream))
            .Select(s => s.Theme)
            .Distinct()
            .OrderBy(t => t)
            .ToList();

        internal List<int> StageNumbers => _referenceService.LoadedStatements
            .Where(s => ChosenStreams.Contains(s.Stage.Stream))
            .Select(s => s.Stage.Stage)
            .Distinct()
            .OrderBy(s => s)
            .ToList();

        internal void ToggleStage(int number)
        {
            if (!stages.Remove(number))
                stages.Add(number);
        }

        internal void Toggle(OASReferenceStatement statement)
        {
            if (!expanded.Remove(statement.Key))
                expanded.Add(statement.Key);
        }

        internal void ExpandAll(IEnumerable<OASReferenceStatement> shown, bool open)
        {
            if (open)
                expanded.UnionWith(shown.Select(s => s.Key));
            else
                expanded.Clear();
        }

        internal void ClearFilters()
        {
            stages.Clear();
            part = "";
            theme = "";
            where = OASReferenceWhere.Any;
            search = "";
        }
    }
}
