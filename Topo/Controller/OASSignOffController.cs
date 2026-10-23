using Microsoft.AspNetCore.Components;
using Topo.Model.Insights;
using Topo.Model.Members;
using Topo.Model.OAS;
using Topo.Services;

namespace Topo.Controller
{
    public enum SignOffStep
    {
        Statements,
        Youth,
        Review
    }

    // Quick sign offs at a unit night: pick the statements, pick the youth, then save them for everyone at once
    public class OASSignOffController : ComponentBase
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

        public SignOffStep step = SignOffStep.Statements;
        public List<OASStageListModel> allStages = new List<OASStageListModel>();
        public bool showNonCoreOAS;
        public string selectedStream = "";
        public OASStageListModel? stage;
        public List<OASStatement> statements = new List<OASStatement>();
        public HashSet<string> selectedStatements = new HashSet<string>();
        public string unitId = "";
        public List<MemberListModel> youth = new List<MemberListModel>();
        public Dictionary<string, Result> unitRecords = new Dictionary<string, Result>();
        public HashSet<string> selectedYouth = new HashSet<string>();
        public OASVerifier verifier = new OASVerifier();
        public Dictionary<string, SignOffOutcome> outcomes = new Dictionary<string, SignOffOutcome>();
        public bool loading;
        public bool working;
        public string message = "";

        protected override async Task OnInitializedAsync()
        {
            if (!_storageService.IsAuthenticated || _storageService.IsYouthMember)
            {
                NavigationManager.NavigateTo("index");
                return;
            }

            loading = true;
            allStages = await _oasService.GetOASStagesList();
            verifier = _recordingService.DefaultVerifier();
            unitId = _storageService.UnitId;
            loading = false;
        }

        internal IEnumerable<string> Streams()
        {
            return allStages
                .Where(s => !string.IsNullOrEmpty(s.TemplateLink))
                .Select(s => s.Stream)
                .Distinct()
                .Where(s => showNonCoreOAS || InsightsCalculator.IsCoreStream(s.ToLowerInvariant()))
                .OrderBy(s => !InsightsCalculator.IsCoreStream(s.ToLowerInvariant()))
                .ThenBy(s => s);
        }

        internal List<OASStageListModel> StagesForStream()
        {
            return allStages
                .Where(s => s.Stream == selectedStream && !string.IsNullOrEmpty(s.TemplateLink))
                .OrderBy(s => s.Stage)
                .ThenBy(s => s.SelectListItemText)
                .ToList();
        }

        // A stream with more than one branch at a stage needs the branch named on its button
        internal string StageButtonText(OASStageListModel option)
        {
            var sameStage = StagesForStream().Count(s => s.Stage == option.Stage);
            return sameStage > 1 ? $"Stage {option.Stage} · {option.StageTitle}" : $"Stage {option.Stage}";
        }

        internal void SelectStream(string stream)
        {
            selectedStream = stream;
            stage = null;
            statements.Clear();
            selectedStatements.Clear();
            message = "";
        }

        internal async Task SelectStage(OASStageListModel option)
        {
            stage = option;
            statements.Clear();
            selectedStatements.Clear();
            message = "";
            loading = true;
            StateHasChanged();
            try
            {
                var template = await _recordingService.LoadTemplate(option);
                statements = OASRecording.Statements(template, null);
                if (!statements.Any())
                    message = "Couldn't find any statements for this stage in Terrain.";
            }
            catch (Exception)
            {
                message = "Couldn't load this stage from Terrain.";
            }
            loading = false;
        }

        internal bool LeadersCanVerify => stage != null && stage.Stage <= OASRecording.MaxLeaderVerifiableStage;

        internal bool CanSelect(OASStatement statement) => statement.IsLogbook || LeadersCanVerify;

        internal void ToggleStatement(OASStatement statement)
        {
            if (!CanSelect(statement))
                return;
            if (!selectedStatements.Remove(statement.InputId))
                selectedStatements.Add(statement.InputId);
        }

        internal void SelectAllStatements()
        {
            foreach (var statement in statements.Where(CanSelect))
                selectedStatements.Add(statement.InputId);
        }

        internal async Task GoToYouth()
        {
            if (stage == null || !selectedStatements.Any())
                return;
            step = SignOffStep.Youth;
            message = "";
            await LoadYouth();
        }


        internal async Task LoadYouth()
        {
            youth.Clear();
            unitRecords.Clear();
            if (stage == null || string.IsNullOrEmpty(unitId))
                return;

            loading = true;
            StateHasChanged();
            try
            {
                youth = (await _membersService.GetMembersAsync(unitId))
                    .Where(m => m.isAdultLeader == 0)
                    .OrderBy(m => m.first_name)
                    .ThenBy(m => m.last_name)
                    .ToList();
                unitRecords = await _recordingService.LoadUnitStage(unitId, stage);
            }
            catch (Exception)
            {
                message = "Couldn't load the unit's youth from Terrain.";
            }
            // Drop anyone who no longer has something to add, e.g. after changing the statements
            selectedYouth.RemoveWhere(id => YouthState(id).State != SignOffState.ToAdd);
            loading = false;
        }

        internal YouthSignOff YouthState(string memberId)
        {
            unitRecords.TryGetValue(memberId, out var record);
            return OASSignOff.ForYouth(record, selectedStatements);
        }

        internal void ToggleYouth(string memberId)
        {
            if (YouthState(memberId).State != SignOffState.ToAdd)
                return;
            if (!selectedYouth.Remove(memberId))
                selectedYouth.Add(memberId);
        }

        internal void SelectAllYouth()
        {
            foreach (var member in youth.Where(m => YouthState(m.id).State == SignOffState.ToAdd))
                selectedYouth.Add(member.id);
        }

        internal void GoToStatements()
        {
            step = SignOffStep.Statements;
            message = "";
        }

        internal void GoToReview()
        {
            if (!selectedYouth.Any())
                return;
            step = SignOffStep.Review;
            outcomes.Clear();
            message = "";
        }

        internal void BackToYouth()
        {
            step = SignOffStep.Youth;
            message = "";
        }

        internal bool NeedsVerifier => statements.Any(s => selectedStatements.Contains(s.InputId) && !s.IsLogbook);

        internal bool VerifierValid => !NeedsVerifier || (!string.IsNullOrWhiteSpace(verifier.Name) && !string.IsNullOrWhiteSpace(verifier.Contact));

        internal bool Finished => outcomes.Any() && outcomes.Values.All(o => o.State != SignOffOutcomeState.Waiting && o.State != SignOffOutcomeState.Saving);

        // One youth at a time: saving switches Terrain to that youth's profile and back
        internal async Task SaveAll()
        {
            if (stage == null || working || !VerifierValid)
                return;
            working = true;
            message = "";
            var inputIds = selectedStatements.ToList();
            var order = SelectedYouthInOrder().Select(m => m.id).ToList();
            outcomes = order.ToDictionary(id => id, id => new SignOffOutcome());
            foreach (var memberId in order)
            {
                outcomes[memberId].State = SignOffOutcomeState.Saving;
                StateHasChanged();
                outcomes[memberId] = await _recordingService.SignOff(memberId, stage, inputIds, verifier);
                StateHasChanged();
            }
            working = false;
            // Pick up what was just saved, so a second round shows it as done
            await LoadYouth();
        }

        internal List<MemberListModel> SelectedYouthInOrder()
        {
            return youth.Where(m => selectedYouth.Contains(m.id)).ToList();
        }

        internal int OutcomeCount(SignOffOutcomeState state) => outcomes.Values.Count(o => o.State == state);

        // Same statements for more youth
        internal void MoreYouth()
        {
            selectedYouth.Clear();
            outcomes.Clear();
            step = SignOffStep.Youth;
        }

        internal void StartAgain()
        {
            selectedYouth.Clear();
            selectedStatements.Clear();
            outcomes.Clear();
            step = SignOffStep.Statements;
        }

        internal string StageName => stage == null ? "" : $"{stage.Stream} Stage {stage.Stage}";

        internal static string StatusDisplay(string status)
        {
            return status switch
            {
                "pending_review" => "Submitted for review",
                "pending_approval" => "Waiting for approval",
                "approved" => "Approved",
                "awarded" => "Awarded",
                _ => status.Replace("_", " ")
            };
        }
    }
}
