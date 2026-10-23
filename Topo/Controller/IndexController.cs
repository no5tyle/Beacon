using Blazored.LocalStorage;
using Topo.Model.Index;
using Topo.Services;
using Microsoft.AspNetCore.Components;
using System.Reflection;

namespace Topo.Controller
{
    public class IndexController : ComponentBase
    {
        [Inject]
        public StorageService _storageService { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject]
        public ILocalStorageService _localStorageService { get; set; }

        public IndexPageViewModel indexPageViewModel = new IndexPageViewModel();

        // Units in the chosen group; the unit picker only shows when there's more than one
        internal Dictionary<string, string> Units => _storageService.Units;

        internal string UnitId => _storageService.UnitId;

        protected override void OnInitialized()
        {
            // Signed out, the home page is the login page. Replacing the history entry keeps Back from bouncing here again
            if (!_storageService.IsAuthenticated)
            {
                NavigationManager.NavigateTo("login", replace: true);
                return;
            }

            indexPageViewModel.IsAuthenticated = _storageService.IsAuthenticated;
            indexPageViewModel.FullName = _storageService.MemberName ?? "";
            indexPageViewModel.Groups = _storageService.Groups;
            indexPageViewModel.GroupId = _storageService.GroupId ?? "";
            indexPageViewModel.GroupErrorMessage = string.IsNullOrEmpty(_storageService.GroupId) ? "Please select a group to access" : "";
        }

        internal async Task GroupChange(ChangeEventArgs e)
        {
            var groupId = e.Value?.ToString() ?? "";
            _storageService.GroupId = groupId;
            _storageService.GroupName = _storageService.Groups.Where(u => u.Key == groupId).FirstOrDefault().Value;
            indexPageViewModel.GroupId = groupId;
            indexPageViewModel.GroupErrorMessage = string.IsNullOrEmpty(_storageService.GroupId) ? "Please select a group to access" : "";
            // A unit from the previous group doesn't belong to this one; use the remembered unit if it's in this group
            if (!_storageService.Units.ContainsKey(_storageService.UnitId))
                _storageService.UnitId = "";
            if (string.IsNullOrEmpty(_storageService.UnitId))
            {
                try
                {
                    var savedUnit = await _localStorageService.GetItemAsync<string>(StorageService.ChosenUnitStorageKey);
                    if (!string.IsNullOrEmpty(savedUnit) && _storageService.Units.ContainsKey(savedUnit))
                        _storageService.UnitId = savedUnit;
                }
                catch
                {
                }
            }
        }

        // Every page works on the unit chosen here, and it's remembered on this device for next time
        internal async Task UnitChange(ChangeEventArgs e)
        {
            _storageService.UnitId = e.Value?.ToString() ?? "";
            try
            {
                await _localStorageService.SetItemAsync(StorageService.ChosenUnitStorageKey, _storageService.UnitId);
            }
            catch
            {
                // Storage can be unavailable, e.g. in a private window; the unit just isn't remembered
            }
        }

    }
}
