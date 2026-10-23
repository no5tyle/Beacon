namespace Topo.Services
{
    // Loads the slow unit data (every youth's milestones, OAS, SIAs and peak award progress) in the background
    // once a leader is signed in and a unit is known, so Insights opens straight away
    public class PreloadService
    {
        private readonly StorageService _storageService;
        private readonly IWallchartService _wallchartService;
        private readonly IOASService _oasService;
        private readonly ILogger<PreloadService> _logger;

        public PreloadService(StorageService storageService, IWallchartService wallchartService, IOASService oasService, ILogger<PreloadService> logger)
        {
            _storageService = storageService;
            _wallchartService = wallchartService;
            _oasService = oasService;
            _logger = logger;
        }

        // Safe to call often, including part way through logging in: does nothing unless there's something
        // to load, and never throws back into whatever triggered it
        public void StartIfReady()
        {
            try
            {
                if (!_storageService.IsAuthenticated || _storageService.IsYouthMember || _storageService.GetProfilesResult?.profiles == null)
                    return;
                var unitId = _storageService.UnitId;
                if (string.IsNullOrEmpty(unitId) || _wallchartService.IsCached(unitId) || _wallchartService.IsLoading(unitId))
                    return;
                _ = Preload(unitId);
            }
            catch (Exception ex)
            {
                _logger.LogInformation($"Preload: not started: {ex.Message}");
            }
        }

        private async Task Preload(string unitId)
        {
            // Background requests don't show the spinner over the page the leader is using
            SpinnerService.Quiet.Value = true;
            try
            {
                await _oasService.GetOASStagesList();
                await _wallchartService.GetWallchartItems(unitId);
            }
            catch (Exception ex)
            {
                // Insights loads it again when opened, and shows any error there
                _logger.LogInformation($"Preload: unit data not loaded in the background: {ex.Message}");
            }
        }
    }
}
