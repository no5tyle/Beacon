using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Newtonsoft.Json;
using System;
using Topo.Model.Insights;
using Topo.Model.Members;
using Topo.Model.OAS;
using Topo.Model.Progress;
using Topo.Model.ReportGeneration;
using Topo.Services;

namespace Topo.Controller
{
    public class ProgressDetailsController : ComponentBase
    {
        [Inject]
        public IProgressService _progressService { get; set; }

        [Inject]
        public StorageService _storageService { get; set; }

        [Inject]
        IJSRuntime JS { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject]
        public IInsightsService _insightsService { get; set; }

        [Inject]
        public ILogger<ProgressDetailsController> _logger { get; set; }

        [Parameter]
        public string MemberId { get; set; }

        public ProgressDetailsPageViewModel model = new ProgressDetailsPageViewModel();

        public MemberInsightsReport? insights;
        public bool insightsLoading;
        public string insightsError = "";
        // Non-core OAS streams are hidden unless the leader asks for them
        public bool showNonCoreOAS;
        // Stages below where the section typically works are hidden unless asked for
        public bool showAllStages;

        // AI plan prompt: initials only by default, nothing else that identifies the youth
        public bool promptLeaveOutInitials;
        public string promptNotes = "";
        public bool promptPreview;
        public string promptStatus = "";

        public bool loadingDetails = true;

        protected override async Task OnInitializedAsync()
        {
            if (!_storageService.IsAuthenticated)
                NavigationManager.NavigateTo("index");

            model = await _progressService.GetProgressDetailsPageViewModel(MemberId);
            model.GroupName = _storageService.GroupNameDisplay;
            loadingDetails = false;

            // Show the progress straight away, then fill in the insights which need extra OAS lookups
            StateHasChanged();
            await LoadInsights();
        }

        internal async Task ToggleNonCoreOAS(ChangeEventArgs e)
        {
            showNonCoreOAS = e.Value is bool value && value;
            await LoadInsights();
        }

        internal async Task ToggleAllStages(ChangeEventArgs e)
        {
            showAllStages = e.Value is bool value && value;
            await LoadInsights();
        }

        private async Task LoadInsights()
        {
            insightsLoading = true;
            insightsError = "";
            try
            {
                insights = await _insightsService.GetMemberInsights(model, new InsightsSettings { IncludeNonCoreOAS = showNonCoreOAS, SectionStagesOnly = !showAllStages });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: member analysis failed");
                insightsError = "Unable to build insights for this member.";
            }
            insightsLoading = false;
        }

        internal string BuildPrompt()
        {
            if (insights == null)
                return "";
            return PlanPromptBuilder.Build(insights, model.Member.first_name, model.Member.last_name, promptLeaveOutInitials, insights.Rules.SectionDisplay, DateTime.Today, showNonCoreOAS, promptNotes);
        }

        internal async Task CopyPromptClick()
        {
            try
            {
                if (!await JS.InvokeAsync<bool>("copyText", BuildPrompt()))
                    throw new InvalidOperationException("Browser refused clipboard access");
                promptStatus = "Copied. Paste it into the AI chat tool you use.";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Insights: unable to copy AI prompt");
                promptPreview = true;
                promptStatus = "Couldn't copy automatically. Select the prompt below and copy it.";
            }
        }

        public string FormatOAS(string stream, int stage)
        {
            if (model.OASSummaries.Where(o => o.Stream == stream && o.Stage == stage).FirstOrDefault() == null)
            {
                return "";
            }
            else if (model.OASSummaries.Where(o => o.Stream == stream && o.Stage == stage && o.Awarded > DateTime.MinValue).OrderByDescending(o => o.Awarded).FirstOrDefault() != null)
            {
                var summary = model.OASSummaries.Where(o => o.Stream == stream && o.Stage == stage).OrderByDescending(o => o.Awarded).FirstOrDefault();
                return $"{summary.Awarded.ToString("dd/MM/yy")} {summary.Section}";
            }
            else if (model.OASSummaries.Where(o => o.Stream == stream && o.Stage == stage && o.Approved > DateTime.MinValue).OrderByDescending(o => o.Approved).FirstOrDefault() != null)
            {
                var summary = model.OASSummaries.Where(o => o.Stream == stream && o.Stage == stage).OrderByDescending(o => o.Approved).FirstOrDefault();
                return "Approved";
//return $"{summary.Awarded.ToString("dd/MM/yy")} {summary.Section}";
            }
            else
            {
                return "Started";
            }
        }
    }
}
