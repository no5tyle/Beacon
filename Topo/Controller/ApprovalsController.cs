using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Newtonsoft.Json;
using System.Net.NetworkInformation;
using System.Reflection;
using Topo.Model.AdditionalAwards;
using Topo.Model.Approvals;
using Topo.Model.ReportGeneration;
using Topo.Services;


namespace Topo.Controller
{
    public class ApprovalsController : ComponentBase
    {
        [Inject]
        public StorageService _storageService { get; set; }

        [Inject]
        public IApprovalsService _approvalsService { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        public ApprovalsPageViewModel model = new ApprovalsPageViewModel();

        // Name filter (empty means everyone) and grouping for the approvals table and report
        public HashSet<string> selectedNames = new HashSet<string>();
        public bool showNameFilter;
        public bool groupByMember;

        internal List<string> MemberNames => (model.Approvals ?? new List<ApprovalsListModel>())
            .Select(a => a.member_display_name).Distinct().OrderBy(n => n).ToList();

        internal List<ApprovalsListModel> FilteredApprovals => (model.Approvals ?? new List<ApprovalsListModel>())
            .Where(a => !selectedNames.Any() || selectedNames.Contains(a.member_display_name))
            .ToList();

        internal IEnumerable<IGrouping<string, ApprovalsListModel>> GroupedApprovals => FilteredApprovals
            .OrderBy(a => groupByMember ? a.member_display_name : a.achievement_name)
            .ThenBy(a => groupByMember ? a.achievement_name : a.member_display_name)
            .GroupBy(a => groupByMember ? a.member_display_name : a.achievement_name);

        internal void ToggleName(string name)
        {
            if (!selectedNames.Remove(name))
                selectedNames.Add(name);
        }

        internal string NameFilterText => selectedNames.Count == 0 ? "Everyone" : selectedNames.Count == 1 ? selectedNames.First() : $"{selectedNames.Count} youth";
        protected override void OnInitialized()
        {
            if (!_storageService.IsAuthenticated)
                NavigationManager.NavigateTo("index");

            model.GroupName = _storageService.GroupNameDisplay;
            model.Units = _storageService.Units;
            model.ApprovalSearchFromDate = DateTime.Now.AddMonths(-2);
            model.ApprovalSearchToDate = DateTime.Now;
            if (!string.IsNullOrEmpty(_storageService.UnitId))
            {
                model.UnitId = _storageService.UnitId;
                model.UnitName = _storageService.UnitName;
            }
        }

        internal async Task UnitChange(ChangeEventArgs e)
        {
            var unitId = e.Value?.ToString() ?? "";
            model.UnitId = unitId;
            _storageService.UnitId = model.UnitId;
            model.UnitName = _storageService.UnitName;
            await RefreshApprovalsClick();
        }

        public bool loadingApprovals;

        internal async Task RefreshApprovalsClick()
        {
            if (!string.IsNullOrEmpty(model.UnitName))
            {
                loadingApprovals = true;
                model.Approvals = await _approvalsService.GetApprovalListItems(_storageService.UnitId);
                loadingApprovals = false;
                model.Approvals = model.Approvals?.Where(a => a.submission_date >= model.ApprovalSearchFromDate && a.submission_date <= model.ApprovalSearchToDate.AddDays(1)).ToList() ?? new List<ApprovalsListModel>();
                if (!model.ShowRejected)
                    model.Approvals = model.Approvals.Where(a => a.submission_outcome.ToLower() != "rejected").ToList();
            }
        }
    }
}
