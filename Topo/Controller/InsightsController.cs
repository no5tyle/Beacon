using Blazored.LocalStorage;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Topo.Model.Insights;
using Topo.Services;

namespace Topo.Controller
{
    public class InsightsController : ComponentBase, IDisposable
    {
        [Inject]
        public IWallchartService _wallchartService { get; set; }

        public bool analysing;
        public bool showFilters;

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

        [Inject]
        public IMembersService _membersService { get; set; }

        [Inject]
        public ILocalStorageService _localStorage { get; set; }

        // Focus youth are treated like youth moving up soon. The picks are kept in this browser per unit.
        public List<KeyValuePair<string, string>> unitYouth = new List<KeyValuePair<string, string>>();
        public HashSet<string> focusIds = new HashSet<string>();
        public bool showFocusPicker;

        public InsightsPageViewModel model = new InsightsPageViewModel();

        // AI prompt for planning one OAS focused unit night, built from unit level counts only
        public int nightPromptMinutes = 90;
        public string nightPromptNotes = "";
        public bool nightPromptPreview;
        public string nightPromptStatus = "";

        protected override async Task OnInitializedAsync()
        {
            _wallchartService.ProgressChanged += ProgressChanged;
            if (_storageService.IsAuthenticated && !string.IsNullOrEmpty(model.UnitId))
                await LoadFocusYouth();
        }

        // Analyse as soon as the page opens. The unit's data is usually already loaded in the background after login.
        protected override async Task OnAfterRenderAsync(bool firstRender)
        {
            if (firstRender && _storageService.IsAuthenticated && !string.IsNullOrEmpty(model.UnitId) && model.Report == null)
            {
                await AnalyseClick();
                StateHasChanged();
            }
        }

        private void ProgressChanged()
        {
            if (analysing)
                InvokeAsync(StateHasChanged);
        }

        public void Dispose()
        {
            _wallchartService.ProgressChanged -= ProgressChanged;
        }

        internal (int Done, int Total) LoadProgress => _wallchartService.LoadProgress(model.UnitId);

        internal bool LoadingYouth => analysing && !_wallchartService.IsCached(model.UnitId);

        // Settings that differ from the defaults, shown as a count on the Filters button
        internal int ActiveFilterCount => (focusIds.Any() ? 1 : 0) + (model.Settings.IncludeNonCoreOAS ? 1 : 0)
            + (model.Settings.SectionStagesOnly ? 0 : 1) + (model.SuppressLastName ? 1 : 0);

        internal void ToggleFilters() => showFilters = !showFilters;

        internal async Task ApplyFilters()
        {
            showFilters = false;
            await AnalyseClick();
        }

        // Fetch every youth's progress from Terrain again, e.g. after changes made in Terrain itself
        internal async Task RefreshClick()
        {
            _storageService.CachedWallchartItems.RemoveAll(c => c.Key == model.UnitId);
            await AnalyseClick();
        }

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

        internal async Task UnitChange(ChangeEventArgs e)
        {
            var unitId = e.Value?.ToString() ?? "";
            _storageService.UnitId = unitId;
            model.UnitId = unitId;
            model.UnitName = _storageService.UnitName;
            model.Report = null;
            LoadSectionRules();
            await LoadFocusYouth();
            await AnalyseClick();
        }

        private string FocusStorageKey => $"insights-focus-youth-{model.UnitId}";

        private async Task LoadFocusYouth()
        {
            unitYouth.Clear();
            focusIds.Clear();
            if (string.IsNullOrEmpty(model.UnitId))
                return;
            try
            {
                var members = await _membersService.GetMembersAsync(model.UnitId);
                unitYouth = members
                    .Where(m => m.isAdultLeader == 0)
                    .OrderBy(m => m.first_name).ThenBy(m => m.last_name)
                    .Select(m => new KeyValuePair<string, string>(m.id, $"{m.first_name} {m.last_name}"))
                    .ToList();
                var saved = await _localStorage.GetItemAsync<List<string>>(FocusStorageKey) ?? new List<string>();
                focusIds = saved.Where(id => unitYouth.Any(y => y.Key == id)).ToHashSet();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: unable to load focus youth");
            }
        }

        internal async Task ToggleFocus(string memberId)
        {
            if (!focusIds.Remove(memberId))
                focusIds.Add(memberId);
            await SaveFocusAndRebuild();
        }

        internal async Task ClearFocus()
        {
            focusIds.Clear();
            await SaveFocusAndRebuild();
        }

        private async Task SaveFocusAndRebuild()
        {
            try
            {
                await _localStorage.SetItemAsync(FocusStorageKey, focusIds.ToList());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: unable to save focus youth");
            }
            if (model.Report != null)
                model.Report = _insightsService.RebuildLastReport(model.UnitId, model.Settings, focusIds) ?? model.Report;
        }

        internal string FocusButtonText => focusIds.Count == 0 ? "None" : focusIds.Count == 1 ? unitYouth.FirstOrDefault(y => focusIds.Contains(y.Key)).Value ?? "1 youth" : $"{focusIds.Count} youth";

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
            if (string.IsNullOrEmpty(model.UnitId) || analysing)
                return;

            analysing = true;
            model.ErrorMessage = "";
            _storageService.SuppressLastName = model.SuppressLastName;
            try
            {
                model.Report = await _insightsService.GetInsightsReport(model.UnitId, model.Settings, focusIds);
                if (model.Report.YouthCount == 0)
                    model.ErrorMessage = "No youth members found for this unit.";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: analysis failed");
                model.ErrorMessage = "Unable to analyse the unit. Check Terrain is responding, then tap Refresh.";
            }
            analysing = false;
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

        // Moving up soon or a focus youth
        // Expanded rows in the missing requirements tables show the statement's explanation and who's missing
        private readonly HashSet<string> expandedGaps = new HashSet<string>();

        private static string GapKey(RequirementGap gap) => $"{gap.Stream}/{gap.Stage}/{gap.InputGroup}/{gap.InputLabel}";

        internal bool IsGapExpanded(RequirementGap gap) => expandedGaps.Contains(GapKey(gap));

        internal void ToggleGap(RequirementGap gap)
        {
            if (!expandedGaps.Remove(GapKey(gap)))
                expandedGaps.Add(GapKey(gap));
        }

        internal bool IsMovingUp(string memberId)
        {
            return model.Report?.MoveUpCandidates.Any(c => c.MemberId == memberId) ?? false;
        }

        internal string PriorityBadge(string memberId)
        {
            var candidate = model.Report?.MoveUpCandidates.FirstOrDefault(c => c.MemberId == memberId);
            if (candidate == null)
                return "";
            return candidate.IsMovingUp ? "moving up" : "focus";
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

        internal static string MonthsDisplay(double? months)
        {
            if (!months.HasValue)
                return "no birth date";
            if (months < 0)
                return "Due to move up";
            return $"{months.Value:0.#} mths";
        }
    }
}
