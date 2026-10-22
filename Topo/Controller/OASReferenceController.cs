using Blazored.LocalStorage;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using System.Text.RegularExpressions;
using Topo.Model.Insights;
using Topo.Model.OAS;
using Topo.Services;

namespace Topo.Controller
{
    public class OASReferenceController : ComponentBase
    {
        [Inject]
        public IOASReferenceService _referenceService { get; set; }

        [Inject]
        public NavigationManager NavigationManager { get; set; }

        [Inject]
        public IJSRuntime JS { get; set; }

        [Inject]
        public ILocalStorageService _localStorage { get; set; }

        // True for the installable Topo Reference app, which shows the filters behind a menu button
        [Parameter]
        public bool AppMode { get; set; }

        public const string CoreStreams = "core";
        public const string AllStreams = "all";
        // Showing thousands of statements at once makes the page slow, so the list is capped
        public const int DisplayLimit = 300;
        private const string StarredStorageKey = "topo-reference-starred";
        private const string OfflineSavedStorageKey = "topo-reference-offline-saved";

        public string streamChoice = CoreStreams;
        public HashSet<int> stages = new HashSet<int>();
        public string part = "";
        public string theme = "";
        public OASReferenceWhere where = OASReferenceWhere.Any;
        public string search = "";
        public string loadingMessage = "";
        public HashSet<string> expanded = new HashSet<string>();
        public bool filtersOpen;
        public HashSet<string> starred = new HashSet<string>();
        public bool starredOnly;
        public string toast = "";
        public bool offlineSupported;
        public bool savingOffline;
        public string offlineStatus = "";
        private string sharedStatement = "";
        // Set once a shared statement has loaded, so the page scrolls to it after the next render
        private string scrollTo = "";
        private string lastQuery = "";

        protected override async Task OnInitializedAsync()
        {
            starred = await Load<HashSet<string>>(StarredStorageKey) ?? new HashSet<string>();
            ApplyLink(OASReferenceLink.Parse(new Uri(NavigationManager.Uri).Query));
            await LoadChosenStreams();
            await LoadStarredStreams();
            OpenSharedStatement();
        }

        protected override async Task OnAfterRenderAsync(bool firstRender)
        {
            if (firstRender && AppMode)
            {
                offlineSupported = await JS.InvokeAsync<bool>("topoOfflineSupported");
                var saved = await Load<DateTime?>(OfflineSavedStorageKey);
                if (saved != null)
                    offlineStatus = $"Last saved for offline use on {saved.Value.ToLocalTime():d MMM yyyy}.";
                StateHasChanged();
            }
            if (!string.IsNullOrEmpty(scrollTo))
            {
                await JS.InvokeVoidAsync("topoScrollTo", ElementId(scrollTo));
                scrollTo = "";
            }
            // Keep the address bar matching the filters, so it can be bookmarked or shared
            var query = CurrentLink.ToQuery();
            if (query != lastQuery)
            {
                lastQuery = query;
                await JS.InvokeVoidAsync("topoReplaceQuery", query);
            }
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

        private async Task LoadChosenStreams() => await LoadStreams(ChosenStreams);

        // Starred statements can come from streams outside the current filter
        private async Task LoadStarredStreams() => await LoadStreams(starred.Select(OASReference.StreamOfKey).Distinct());

        private async Task LoadStreams(IEnumerable<string> streams)
        {
            var known = InsightsCalculator.Streams.Select(s => s.Key).ToHashSet();
            foreach (var stream in streams.Where(s => known.Contains(s) && !_referenceService.IsLoaded(s)).ToList())
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

        private void ApplyLink(OASReferenceLink link)
        {
            var known = InsightsCalculator.Streams.Select(s => s.Key).ToHashSet();
            if (!string.IsNullOrEmpty(link.Statement))
            {
                // A shared statement opens on its own stream and stage, expanded
                streamChoice = known.Contains(OASReference.StreamOfKey(link.Statement)) ? OASReference.StreamOfKey(link.Statement) : CoreStreams;
                sharedStatement = link.Statement;
                return;
            }
            streamChoice = link.Stream == AllStreams || known.Contains(link.Stream) ? link.Stream : CoreStreams;
            stages = link.Stages.ToHashSet();
            part = OASReference.Parts.Contains(link.Part) ? link.Part : "";
            theme = link.Theme;
            where = link.Where;
            search = link.Search;
            starredOnly = link.Starred;
        }

        private void OpenSharedStatement()
        {
            var statement = _referenceService.LoadedStatements.FirstOrDefault(s => s.Key == sharedStatement);
            sharedStatement = "";
            if (statement == null)
                return;
            stages = new HashSet<int> { statement.Stage.Stage };
            expanded.Add(statement.Key);
            scrollTo = statement.Key;
        }

        internal OASReferenceLink CurrentLink => new OASReferenceLink
        {
            Stream = streamChoice == CoreStreams ? "" : streamChoice,
            Stages = stages.ToList(),
            Part = part,
            Theme = theme,
            Where = where,
            Search = search,
            Starred = starredOnly
        };

        internal OASReferenceFilter Filter => new OASReferenceFilter
        {
            Streams = ChosenStreams.ToHashSet(),
            Stages = stages.ToHashSet(),
            Part = part,
            Theme = theme,
            Where = where,
            Search = search
        };

        // The starred list ignores the other filters, so nothing starred is hidden by mistake
        internal List<OASReferenceStatement> Results => starredOnly
            ? OASReference.Filter(_referenceService.LoadedStatements, new OASReferenceFilter { Keys = starred })
            : OASReference.Filter(_referenceService.LoadedStatements, Filter);

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

        internal static string ElementId(string key) => "st-" + Regex.Replace(key, "[^A-Za-z0-9]", "-");

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

        // Filters set away from their defaults, shown on the app's menu button
        internal int ActiveFilterCount => new[]
        {
            streamChoice != CoreStreams,
            stages.Any(),
            !string.IsNullOrEmpty(part),
            !string.IsNullOrEmpty(theme),
            where != OASReferenceWhere.Any
        }.Count(f => f);

        // A full page load, so the browser picks up the app's name, icon and home screen support
        internal void OpenApp()
        {
            NavigationManager.NavigateTo("reference/", forceLoad: true);
        }

        internal void ClearFilters()
        {
            stages.Clear();
            part = "";
            theme = "";
            where = OASReferenceWhere.Any;
            search = "";
        }

        internal async Task ToggleStar(OASReferenceStatement statement)
        {
            if (!starred.Remove(statement.Key))
                starred.Add(statement.Key);
            await Save(StarredStorageKey, starred);
        }

        internal async Task ShowStarred(bool show)
        {
            starredOnly = show;
            filtersOpen = false;
            if (show)
                await LoadStarredStreams();
        }

        internal async Task ClearStarred()
        {
            if (!await JS.InvokeAsync<bool>("topoConfirm", $"Remove all {starred.Count} starred statements?"))
                return;
            starred.Clear();
            await Save(StarredStorageKey, starred);
        }

        // Shared links always open the installable app
        private string AppUrl(string query) => NavigationManager.BaseUri + "reference/" + query;

        internal async Task ShareStatement(OASReferenceStatement statement)
        {
            var link = new OASReferenceLink { Statement = statement.Key };
            await Share($"{statement.Label}\n{statement.Stage.Title} · {statement.Part}", AppUrl(link.ToQuery()));
        }

        internal async Task ShareView()
        {
            var count = Results.Count;
            await Share($"{count} OAS statement{(count == 1 ? "" : "s")} in Topo Reference", AppUrl(CurrentLink.ToQuery()));
        }

        internal async Task ShareStarred()
        {
            await Share(OASReference.ChecklistText(Results, "Starred OAS statements, from Topo Reference"), "");
        }

        private async Task Share(string text, string url)
        {
            var result = await JS.InvokeAsync<string>("topoShare", "Topo Reference", text, url);
            if (result == "copied")
                await ShowToast(string.IsNullOrEmpty(url) ? "Copied to the clipboard" : "Link copied to the clipboard");
            else if (result == "failed")
                await ShowToast("Sharing isn't available in this browser");
        }

        internal async Task Print()
        {
            filtersOpen = false;
            StateHasChanged();
            await JS.InvokeVoidAsync("topoPrint");
        }

        internal async Task SaveForOffline()
        {
            savingOffline = true;
            var streams = InsightsCalculator.Streams.Select(s => s.Key).ToList();
            await LoadStreams(streams);
            offlineStatus = "Saving templates and app files...";
            StateHasChanged();
            var urls = _referenceService.LoadedUrls.ToList();
            var saved = await JS.InvokeAsync<int>("topoSaveForOffline", urls);
            if (saved == urls.Count)
            {
                await Save(OfflineSavedStorageKey, DateTime.UtcNow);
                offlineStatus = $"All {streams.Count} streams are saved for offline use.";
            }
            else
            {
                offlineStatus = $"Only {saved} of {urls.Count} templates were saved. Try again with better signal.";
            }
            savingOffline = false;
        }

        private async Task ShowToast(string message)
        {
            toast = message;
            StateHasChanged();
            await Task.Delay(2500);
            if (toast == message)
                toast = "";
        }

        // Local storage can be blocked, for example in private browsing; the reference still works without it
        private async Task<T?> Load<T>(string key)
        {
            try
            {
                return await _localStorage.GetItemAsync<T>(key);
            }
            catch
            {
                return default;
            }
        }

        private async Task Save<T>(string key, T value)
        {
            try
            {
                await _localStorage.SetItemAsync(key, value);
            }
            catch
            {
            }
        }
    }
}
