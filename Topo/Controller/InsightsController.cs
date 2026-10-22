using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Topo.Model.Insights;
using Topo.Services;

namespace Topo.Controller
{
    public class InsightsController : ComponentBase
    {
        [Inject]
        public StorageService _storageService { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject]
        public IInsightsService _insightsService { get; set; }

        [Inject]
        public ILogger<InsightsController> _logger { get; set; }

        [Inject]
        IJSRuntime JS { get; set; }

        public InsightsPageViewModel model = new InsightsPageViewModel();

        // AI prompt for planning one OAS focused unit night, built from unit level counts only
        public int nightPromptMinutes = 90;
        public string nightPromptNotes = "";
        public bool nightPromptPreview;
        public string nightPromptStatus = "";

        protected override void OnInitialized()
        {
            if (!_storageService.IsAuthenticated)
                NavigationManager.NavigateTo("index");

            if (!string.IsNullOrEmpty(_storageService.UnitId))
            {
                model.UnitId = _storageService.UnitId;
                model.UnitName = _storageService.UnitName;
                LoadSectionRules();
            }

            model.GroupName = _storageService.GroupNameDisplay;
            model.Units = _storageService.Units ?? new Dictionary<string, string>();
            model.SuppressLastName = _storageService.SuppressLastName;
        }

        internal void UnitChange(ChangeEventArgs e)
        {
            var unitId = e.Value?.ToString() ?? "";
            _storageService.UnitId = unitId;
            model.UnitId = unitId;
            model.UnitName = _storageService.UnitName;
            model.Report = null;
            LoadSectionRules();
        }

        private void LoadSectionRules()
        {
            try
            {
                model.SectionRules = model.Settings.RulesFor(_storageService.Section);
            }
            catch (IndexOutOfRangeException)
            {
                model.SectionRules = new SectionRules();
            }
        }

        internal async Task AnalyseClick()
        {
            if (string.IsNullOrEmpty(model.UnitId))
                return;

            model.ErrorMessage = "";
            _storageService.SuppressLastName = model.SuppressLastName;
            try
            {
                model.Report = await _insightsService.GetInsightsReport(model.UnitId, model.Settings);
                if (model.Report.YouthCount == 0)
                    model.ErrorMessage = "No youth members found for this unit.";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: analysis failed");
                model.ErrorMessage = "Unable to analyse the unit. Try the Wallchart report first to check Terrain is responding.";
            }
        }

        internal string BuildNightPrompt()
        {
            if (model.Report == null)
                return "";
            var includesNonCore = !model.Report.StreamCoverage.All(s => s.IsCore);
            return NightPromptBuilder.Build(model.Report, model.Report.Rules.SectionDisplay, DateTime.Today, includesNonCore, nightPromptMinutes, nightPromptNotes);
        }

        internal async Task CopyNightPromptClick()
        {
            try
            {
                if (!await JS.InvokeAsync<bool>("copyText", BuildNightPrompt()))
                    throw new InvalidOperationException("Browser refused clipboard access");
                nightPromptStatus = "Copied. Paste it into the AI chat tool you use.";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: unable to copy night prompt");
                nightPromptPreview = true;
                nightPromptStatus = "Couldn't copy automatically. Select the prompt below and copy it.";
            }
        }

        internal void SelectTab(InsightsTab tab)
        {
            model.SelectedTab = tab;
        }

        internal void ToggleStream(string stream)
        {
            if (!model.ExpandedStreams.Remove(stream))
                model.ExpandedStreams.Add(stream);
        }

        internal void ToggleTheme(string theme)
        {
            if (!model.ExpandedThemes.Remove(theme))
                model.ExpandedThemes.Add(theme);
        }

        internal string MemberName(string memberId)
        {
            if (model.Report != null && model.Report.MemberNames.TryGetValue(memberId, out var name))
                return name;
            return memberId;
        }

        // How many of the most needed requirements each missing requirements table shows
        internal const int MostCommonLimit = 20;

        internal static string StageRangeDisplay(SectionRules rules)
        {
            var low = Math.Max(1, rules.LowestStageShown);
            var high = Math.Clamp(rules.HighestStageShown, low, 9);
            return low == high ? $"Stage {low}" : $"Stages {low}-{high}";
        }

        // Stream in the usual OAS order, then stage, then Plan > Do > Review, keeping the most needed first within that
        internal static IEnumerable<RequirementGap> SortByStreamAndStage(IEnumerable<RequirementGap> gaps)
        {
            var groupOrder = new[] { "Plan", "Do", "Review" };
            return gaps
                .OrderBy(g => InsightsCalculator.Streams.FindIndex(s => s.Key == g.Stream))
                .ThenBy(g => g.Stage)
                .ThenBy(g => Array.IndexOf(groupOrder, g.InputGroup) is var i && i >= 0 ? i : groupOrder.Length);
        }

        internal bool IsMovingUp(string memberId)
        {
            return model.Report?.MoveUpCandidates.Any(c => c.MemberId == memberId) ?? false;
        }

        internal static string HeatClass(int reached, int youthCount)
        {
            if (youthCount == 0 || reached == 0)
                return "heat-0";
            var ratio = (double)reached / youthCount;
            return ratio switch
            {
                >= 0.75 => "heat-4",
                >= 0.5 => "heat-3",
                >= 0.25 => "heat-2",
                _ => "heat-1"
            };
        }

        internal static string UrgencyClass(Urgency urgency)
        {
            return urgency switch
            {
                Urgency.High => "bg-danger",
                Urgency.Medium => "bg-warning text-dark",
                _ => "bg-secondary"
            };
        }

        internal static string CategoryDisplay(TaskCategory category)
        {
            return category switch
            {
                TaskCategory.PeakAward => "Peak award",
                TaskCategory.Introduction => "Introduction",
                _ => category.ToString()
            };
        }

        internal static string MonthsDisplay(double months)
        {
            if (months < 0)
                return $"overdue {Math.Abs(months):0.#} mths";
            return $"{months:0.#} mths";
        }
    }
}
