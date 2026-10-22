using Newtonsoft.Json;
using Topo.Model.OAS;

namespace Topo.Services
{
    public interface IOASReferenceService
    {
        public bool IsLoaded(string stream);
        public IEnumerable<OASReferenceStatement> LoadedStatements { get; }
        public Task LoadStream(string stream, Action<int, int>? progress = null);
    }

    // Loads OAS templates from Terrain's public template site, so the reference works without signing in.
    // Loaded streams are kept for the rest of the session.
    public class OASReferenceService : IOASReferenceService
    {
        private const string TemplatesAddress = "https://templates.terrain.scouts.com.au/";
        private const int ParallelRequests = 6;

        // A plain client, so loading doesn't trigger the app's full screen spinner
        private readonly HttpClient _httpClient = new HttpClient();
        private readonly ILogger<OASReferenceService> _logger;
        private readonly Dictionary<string, List<OASReferenceStatement>> _statementsByStream = new Dictionary<string, List<OASReferenceStatement>>();

        public OASReferenceService(ILogger<OASReferenceService> logger)
        {
            _logger = logger;
        }

        public bool IsLoaded(string stream) => _statementsByStream.ContainsKey(stream);

        public IEnumerable<OASReferenceStatement> LoadedStatements => _statementsByStream.Values.SelectMany(s => s);

        public async Task LoadStream(string stream, Action<int, int>? progress = null)
        {
            if (IsLoaded(stream))
                return;

            var tree = await Get<GetOASTreeResultsModel>($"oas/{stream}/tree.json");
            if (tree == null)
                return;
            var stages = OASReference.Stages(tree);
            var statements = new List<OASReferenceStatement>();
            var done = 0;
            progress?.Invoke(done, stages.Count);

            foreach (var batch in stages.Chunk(ParallelRequests))
            {
                var results = await Task.WhenAll(batch.Select(async stage => (stage, template: await Get<GetOASTemplateResultModel>(stage.TemplateLink))));
                foreach (var (stage, template) in results)
                {
                    if (template != null)
                        statements.AddRange(OASReference.Statements(stage, template));
                }
                done += batch.Length;
                progress?.Invoke(done, stages.Count);
            }
            _statementsByStream[stream] = statements;
        }

        private async Task<T?> Get<T>(string path) where T : class
        {
            try
            {
                var json = await _httpClient.GetStringAsync(TemplatesAddress + path);
                return JsonConvert.DeserializeObject<T>(json);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"OAS reference: unable to load {path}");
                return null;
            }
        }
    }
}
