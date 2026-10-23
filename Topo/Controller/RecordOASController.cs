using Microsoft.AspNetCore.Components;
using System.Web;
using Topo.Model.Insights;
using Topo.Model.Members;
using Topo.Model.OAS;
using Topo.Services;

namespace Topo.Controller
{
    public class RecordOASController : ComponentBase
    {
        [Inject]
        public StorageService _storageService { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject]
        public IMembersService _membersService { get; set; }

        [Inject]
        public IOASService _oasService { get; set; }

        [Inject]
        public IOASRecordingService _recordingService { get; set; }

        [Parameter]
        public string MemberId { get; set; }

        public MemberListModel member = new MemberListModel();
        public List<OASStageListModel> allStages = new List<OASStageListModel>();
        public bool showNonCoreOAS;
        public string selectedTemplateLink = "";
        public OASRecordingState? state;
        public HashSet<string> ticked = new HashSet<string>();
        public OASVerifier verifier = new OASVerifier();
        public bool loading;
        public bool loadingStages = true;
        public bool confirmingSave;
        public bool confirmingSubmit;
        public bool working;
        public string message = "";
        public bool messageIsError;

        protected override async Task OnInitializedAsync()
        {
            if (!_storageService.IsAuthenticated || _storageService.IsYouthMember)
            {
                NavigationManager.NavigateTo("index");
                return;
            }

            member = await _membersService.GetMember(_storageService.UnitId, MemberId);
            allStages = await _oasService.GetOASStagesList();
            loadingStages = false;
            verifier = _recordingService.DefaultVerifier();

            // Stream and stage can be passed in from the progress page, e.g. ?stream=bushwalking&stage=3
            var query = HttpUtility.ParseQueryString(new Uri(NavigationManager.Uri).Query);
            var stream = query["stream"] ?? "";
            if (!string.IsNullOrEmpty(stream) && int.TryParse(query["stage"], out var stageNumber))
            {
                showNonCoreOAS = !InsightsCalculator.IsCoreStream(stream.ToLowerInvariant());
                var stage = StageOptions()
                    .Where(s => s.Stream.Equals(stream, StringComparison.OrdinalIgnoreCase) && s.Stage == stageNumber)
                    .OrderByDescending(s => s.Branch.Equals(stream, StringComparison.OrdinalIgnoreCase))
                    .FirstOrDefault();
                if (stage != null)
                {
                    selectedTemplateLink = stage.TemplateLink;
                    await LoadStage();
                }
            }
        }

        internal List<OASStageListModel> StageOptions()
        {
            return allStages
                .Where(s => !string.IsNullOrEmpty(s.TemplateLink))
                .Where(s => showNonCoreOAS || InsightsCalculator.IsCoreStream(s.Stream.ToLowerInvariant()))
                .OrderBy(s => s.Stream)
                .ThenBy(s => s.Stage)
                .ThenBy(s => s.SelectListItemText)
                .ToList();
        }

        internal async Task StageChange(ChangeEventArgs e)
        {
            selectedTemplateLink = e.Value?.ToString() ?? "";
            await LoadStage();
        }

        internal async Task LoadStage()
        {
            state = null;
            ticked.Clear();
            confirmingSave = false;
            confirmingSubmit = false;
            var stage = allStages.FirstOrDefault(s => s.TemplateLink == selectedTemplateLink);
            if (stage == null)
                return;

            loading = true;
            StateHasChanged();
            try
            {
                state = await _recordingService.LoadStage(MemberId, stage);
            }
            catch (Exception)
            {
                ShowMessage("Couldn't load this stage from Terrain.", true);
            }
            loading = false;
        }

        internal bool CanEdit => state != null && OASRecording.IsEditable(state.Status);

        internal bool CanVerifyStatements => state != null && state.Stage.Stage <= OASRecording.MaxLeaderVerifiableStage;

        internal bool CanTick(OASStatement statement)
        {
            return CanEdit && !statement.AlreadyDone && (statement.IsLogbook || CanVerifyStatements);
        }

        internal void Toggle(OASStatement statement, ChangeEventArgs e)
        {
            if (e.Value is bool isTicked && isTicked)
                ticked.Add(statement.InputId);
            else
                ticked.Remove(statement.InputId);
            confirmingSave = false;
        }

        internal void TickAllRemaining()
        {
            foreach (var statement in state?.Statements.Where(CanTick) ?? Enumerable.Empty<OASStatement>())
                ticked.Add(statement.InputId);
            confirmingSave = false;
        }

        internal List<OASStatement> NewlyTicked()
        {
            return state?.Statements.Where(s => ticked.Contains(s.InputId)).ToList() ?? new List<OASStatement>();
        }

        internal bool VerifierValid => !string.IsNullOrWhiteSpace(verifier.Name) && !string.IsNullOrWhiteSpace(verifier.Contact);

        internal bool ReadyToSubmit => state != null && CanEdit && state.Achievement != null && !ticked.Any()
            && OASRecording.AllComplete(state.Statements)
            && OASRecording.CanReceiveCredit(state.Stage.Stage, state.CompletedStagesInStream);

        internal void StartSave()
        {
            message = "";
            if (!NewlyTicked().Any())
            {
                ShowMessage("Tick at least one statement first.", true);
                return;
            }
            if (NewlyTicked().Any(s => !s.IsLogbook) && !VerifierValid)
            {
                ShowMessage("Enter the verifier's name and email or phone.", true);
                return;
            }
            confirmingSave = true;
        }

        internal async Task ConfirmSave()
        {
            if (state == null || working)
                return;
            working = true;
            var count = NewlyTicked().Count;
            var result = await _recordingService.SaveVerifications(state, NewlyTicked(), verifier);
            working = false;
            confirmingSave = false;
            if (result.Success)
            {
                await LoadStage();
                ShowMessage($"Saved {count} statement{(count == 1 ? "" : "s")} to Terrain.", false);
            }
            else
            {
                ShowMessage(FailureMessage("save", result), true);
            }
        }

        internal void StartSubmit()
        {
            message = "";
            confirmingSubmit = true;
        }

        internal async Task ConfirmSubmit()
        {
            if (state == null || working)
                return;
            working = true;
            var result = await _recordingService.SubmitForReview(state);
            working = false;
            confirmingSubmit = false;
            if (result.Success)
            {
                await LoadStage();
                ShowMessage("Submitted. It now needs approval by the Unit Council in Terrain.", false);
            }
            else
            {
                ShowMessage(FailureMessage("submit", result), true);
            }
        }

        internal string StageTitle => state == null ? "" : $"{state.Stage.Stream} Stage {state.Stage.Stage}";

        internal string StatusDisplay(string status)
        {
            return status switch
            {
                "" => "Not started",
                "in_progress" => "In progress",
                "draft_review" => "In progress",
                "feedback_review" => "Needs improvement",
                "pending_review" => "Submitted, waiting for Unit Council review",
                "pending_approval" => "Waiting for approval",
                "approved" => "Approved",
                "awarded" => "Awarded",
                _ => status.Replace("_", " ")
            };
        }

        private static string FailureMessage(string action, TerrainWriteResult result)
        {
            if (result.StatusCode > 0)
                return $"Terrain didn't accept the {action} (response {result.StatusCode}). Check the stage in Terrain before trying again.";
            return string.IsNullOrEmpty(result.Body) ? $"Couldn't {action}. Check the stage in Terrain before trying again." : result.Body;
        }

        private void ShowMessage(string text, bool isError)
        {
            message = text;
            messageIsError = isError;
        }
    }
}
