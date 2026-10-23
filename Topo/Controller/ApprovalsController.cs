using Microsoft.AspNetCore.Components;
using Topo.Model.Approvals;
using Topo.Services;

namespace Topo.Controller
{
    // Submissions waiting for the Unit Council in the chosen unit
    public class ApprovalsController : ComponentBase
    {
        [Inject]
        public StorageService _storageService { get; set; }

        [Inject]
        public IApprovalsService _approvalsService { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject]
        public ILogger<ApprovalsController> _logger { get; set; }

        public string unitId = "";
        public string unitName = "";
        public List<PendingApproval> pending = new List<PendingApproval>();
        public bool loadingApprovals;
        public string errorMessage = "";

        // Youth filter (empty means everyone) and grouping
        public HashSet<string> selectedNames = new HashSet<string>();
        public bool showNameFilter;
        public bool groupByMember;

        protected override async Task OnInitializedAsync()
        {
            if (!_storageService.IsAuthenticated)
            {
                NavigationManager.NavigateTo("index");
                return;
            }
            unitId = _storageService.UnitId;
            unitName = _storageService.UnitName ?? "";
            if (!string.IsNullOrEmpty(unitId))
                await RefreshApprovalsClick();
        }

        internal async Task RefreshApprovalsClick()
        {
            if (string.IsNullOrEmpty(unitId) || loadingApprovals)
                return;
            loadingApprovals = true;
            errorMessage = "";
            try
            {
                pending = await _approvalsService.GetPendingApprovals(unitId);
                selectedNames.RemoveWhere(n => !MemberNames.Contains(n));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Approvals: unable to load pending approvals");
                errorMessage = "Couldn't load approvals from Terrain. Try again in a moment.";
            }
            loadingApprovals = false;
        }

        internal List<string> MemberNames => pending.Select(a => a.MemberName).Distinct().OrderBy(n => n).ToList();

        internal List<PendingApproval> FilteredApprovals => pending
            .Where(a => !selectedNames.Any() || selectedNames.Contains(a.MemberName))
            .ToList();

        internal IEnumerable<IGrouping<string, PendingApproval>> GroupedApprovals => FilteredApprovals
            .OrderBy(a => groupByMember ? a.MemberName : a.AchievementName)
            .ThenBy(a => a.SubmittedOn)
            .GroupBy(a => groupByMember ? a.MemberName : a.AchievementName);

        internal void ToggleName(string name)
        {
            if (!selectedNames.Remove(name))
                selectedNames.Add(name);
        }

        internal string NameFilterText => selectedNames.Count == 0 ? "Everyone" : selectedNames.Count == 1 ? selectedNames.First() : $"{selectedNames.Count} youth";

        internal static string SubmittedDisplay(DateTime submitted)
        {
            var days = (DateTime.Today - submitted.ToLocalTime().Date).Days;
            return days switch
            {
                <= 0 => "today",
                1 => "yesterday",
                < 14 => $"{days} days ago",
                _ => submitted.ToLocalTime().ToString("d MMM yyyy")
            };
        }
    }
}
