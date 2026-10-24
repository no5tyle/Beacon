using System.Text.Json.Nodes;
using Topo.Model.OAS;

namespace Topo.Services
{
    public interface IOASRecordingService
    {
        public Task<OASRecordingState> LoadStage(string memberId, OASStageListModel stage);
        public Task<TerrainWriteResult> SaveVerifications(OASRecordingState state, List<OASStatement> newlyTicked, OASVerifier verifier);
        public Task<TerrainWriteResult> SubmitForReview(OASRecordingState state);
        public OASVerifier DefaultVerifier();
        public Task<GetOASTemplateResultModel> LoadTemplate(OASStageListModel stage);
        public Task<Dictionary<string, Result>> LoadUnitStage(string unitId, OASStageListModel stage);
        public Task<SignOffOutcome> SignOff(string memberId, OASStageListModel stage, IReadOnlyCollection<string> inputIds, OASVerifier verifier);
        public Task<SignOffOutcome> SubmitStage(string memberId, OASStageListModel stage);
    }

    // One youth's OAS stage as Topo shows it on the Record OAS page
    public class OASRecordingState
    {
        public string MemberId { get; set; } = string.Empty;
        public OASStageListModel Stage { get; set; } = new OASStageListModel();
        public GetOASTemplateResultModel Template { get; set; } = new GetOASTemplateResultModel();
        public JsonObject? Achievement { get; set; }
        public string AchievementId => Achievement?["id"]?.ToString() ?? "";
        public string Status => Achievement?["status"]?.ToString() ?? "";
        public List<OASStatement> Statements { get; set; } = new List<OASStatement>();
        public List<int> CompletedStagesInStream { get; set; } = new List<int>();
    }

    public class OASRecordingService : IOASRecordingService
    {
        private readonly StorageService _storageService;
        private readonly ITerrainAPIService _terrainAPIService;
        private readonly ILogger<OASRecordingService> _logger;

        private static readonly string[] CompleteStatuses = { "awarded", "approved" };

        private readonly TerrainProfileGate _profileGate;

        public OASRecordingService(StorageService storageService, ITerrainAPIService terrainAPIService, ILogger<OASRecordingService> logger, TerrainProfileGate profileGate)
        {
            _profileGate = profileGate;
            _storageService = storageService;
            _terrainAPIService = terrainAPIService;
            _logger = logger;
        }

        public async Task<OASRecordingState> LoadStage(string memberId, OASStageListModel stage)
        {
            var template = await _terrainAPIService.GetOASTemplateAsync(stage.TemplateLink.Replace("/latest.json", "")) ?? new GetOASTemplateResultModel();
            var achievements = await _terrainAPIService.GetOASAchievementsRawForMember(memberId);
            var stream = stage.Stream.ToLowerInvariant();

            var inStream = achievements.OfType<JsonObject>()
                .Where(a => a["achievement_meta"]?["stream"]?.ToString() == stream)
                .ToList();
            var completed = inStream
                .Where(a => CompleteStatuses.Contains(a["status"]?.ToString()))
                .Select(a => (int?)a["achievement_meta"]?["stage"] ?? 0)
                .ToList();
            // Prefer a completed record, otherwise the one being worked on
            var forStage = inStream
                .Where(a => (int?)a["achievement_meta"]?["stage"] == stage.Stage && a["achievement_meta"]?["branch"]?.ToString() == stage.Branch)
                .OrderByDescending(a => CompleteStatuses.Contains(a["status"]?.ToString()))
                .ThenByDescending(a => a["last_updated"]?.ToString())
                .FirstOrDefault();

            return new OASRecordingState
            {
                MemberId = memberId,
                Stage = stage,
                Template = template,
                Achievement = forStage,
                Statements = OASRecording.Statements(template, forStage?["answers"] as JsonObject),
                CompletedStagesInStream = completed
            };
        }

        public async Task<TerrainWriteResult> SaveVerifications(OASRecordingState state, List<OASStatement> newlyTicked, OASVerifier verifier)
        {
            if (!newlyTicked.Any())
                return new TerrainWriteResult { Success = false, Body = "Nothing new to save." };
            if (!OASRecording.IsEditable(state.Status))
                return new TerrainWriteResult { Success = false, Body = "This stage can't be changed while it is submitted or complete." };
            if (state.Stage.Stage > OASRecording.MaxLeaderVerifiableStage && newlyTicked.Any(s => !s.IsLogbook))
                return new TerrainWriteResult { Success = false, Body = $"Adult leaders can't verify Stage {OASRecording.MaxLeaderVerifiableStage + 1} and above." };

            // Nothing else may talk to Terrain while it is acting as the youth
            using var actingAsYouth = await _profileGate.ActAsYouth();
            try
            {
                await _terrainAPIService.RevokeAssumedProfiles();
                var assumed = await _terrainAPIService.AssumeProfile(state.MemberId);
                if (!assumed.Success)
                    return CouldNotActAsYouth(assumed);

                TerrainWriteResult result;
                if (state.Achievement == null)
                {
                    var answers = OASRecording.AddVerifications(null, newlyTicked, verifier, DateTime.Today);
                    result = await _terrainAPIService.CreateAchievementForMember(state.MemberId, OASRecording.CreateBody(state.Template, state.Stage, _storageService.Section, answers));
                }
                else
                {
                    // Re-read the record so a change made in Terrain since the page loaded isn't overwritten
                    var latest = (await _terrainAPIService.GetOASAchievementsRawForMember(state.MemberId))
                        .OfType<JsonObject>()
                        .FirstOrDefault(a => a["id"]?.ToString() == state.AchievementId);
                    if (latest == null || latest["last_updated"]?.ToString() != state.Achievement["last_updated"]?.ToString())
                        return new TerrainWriteResult { Success = false, Body = "This stage has changed in Terrain since you opened it. Reload and try again." };

                    var answers = OASRecording.AddVerifications(latest["answers"] as JsonObject, newlyTicked, verifier, DateTime.Today);
                    result = await _terrainAPIService.UpdateAchievementForMember(state.MemberId, state.AchievementId, OASRecording.UpdateBody(latest, answers));
                }

                if (result.Success)
                    ClearUnitCaches();
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Record OAS: save failed");
                return new TerrainWriteResult { Success = false, Body = ex.Message };
            }
            finally
            {
                await _terrainAPIService.RevokeAssumedProfiles();
            }
        }

        public async Task<TerrainWriteResult> SubmitForReview(OASRecordingState state)
        {
            if (state.Achievement == null || !OASRecording.IsEditable(state.Status))
                return new TerrainWriteResult { Success = false, Body = "Save the stage first. Only stages in progress can be submitted." };
            if (!OASRecording.AllComplete(state.Statements))
                return new TerrainWriteResult { Success = false, Body = "Every statement, including the logbook, must be ticked before submitting." };
            if (!OASRecording.CanReceiveCredit(state.Stage.Stage, state.CompletedStagesInStream))
                return new TerrainWriteResult { Success = false, Body = $"Stage {state.Stage.Stage - 3} of this stream must be complete before Stage {state.Stage.Stage} can be submitted." };

            // Nothing else may talk to Terrain while it is acting as the youth
            using var actingAsYouth = await _profileGate.ActAsYouth();
            try
            {
                await _terrainAPIService.RevokeAssumedProfiles();
                var assumed = await _terrainAPIService.AssumeProfile(state.MemberId);
                if (!assumed.Success)
                    return CouldNotActAsYouth(assumed);
                var result = await _terrainAPIService.SubmitAchievementOnBehalf(state.MemberId, state.AchievementId, OASRecording.SubmitBody(_storageService.UnitId, LeaderMemberId()));
                if (result.Success)
                    ClearUnitCaches();
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Record OAS: submit failed");
                return new TerrainWriteResult { Success = false, Body = ex.Message };
            }
            finally
            {
                await _terrainAPIService.RevokeAssumedProfiles();
            }
        }

        public async Task<GetOASTemplateResultModel> LoadTemplate(OASStageListModel stage)
        {
            return await _terrainAPIService.GetOASTemplateAsync(stage.TemplateLink.Replace("/latest.json", "")) ?? new GetOASTemplateResultModel();
        }

        // Every youth's record for the stage in one request, to show who each statement would be new for
        public async Task<Dictionary<string, Result>> LoadUnitStage(string unitId, OASStageListModel stage)
        {
            var results = await _terrainAPIService.GetUnitOASAchievements(unitId, stage.Stream.ToLowerInvariant(), stage.Branch, stage.Stage);
            return OASSignOff.LatestByMember(results?.results ?? new Result[0], stage.Branch);
        }

        // Adds the statements one youth doesn't have yet, reading their record fresh from Terrain first
        public async Task<SignOffOutcome> SignOff(string memberId, OASStageListModel stage, IReadOnlyCollection<string> inputIds, OASVerifier verifier)
        {
            OASRecordingState state;
            try
            {
                state = await LoadStage(memberId, stage);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OAS sign off: load failed");
                return new SignOffOutcome { State = SignOffOutcomeState.Failed, Message = "Couldn't load their record from Terrain." };
            }

            if (!OASRecording.IsEditable(state.Status))
                return new SignOffOutcome { State = SignOffOutcomeState.Skipped, Message = "Already submitted or complete." };
            var newlyTicked = state.Statements.Where(s => inputIds.Contains(s.InputId) && !s.AlreadyDone).ToList();
            if (!newlyTicked.Any())
                return new SignOffOutcome { State = SignOffOutcomeState.Skipped, Message = "Already had these." };

            var result = await SaveVerifications(state, newlyTicked, verifier);
            if (result.Success)
                return new SignOffOutcome { State = SignOffOutcomeState.Saved, SavedCount = newlyTicked.Count };
            return new SignOffOutcome
            {
                State = SignOffOutcomeState.Failed,
                Message = result.StatusCode > 0 ? $"Terrain didn't accept it (response {result.StatusCode})." : result.Body
            };
        }

        // Submits one youth's stage for Unit Council review, reading their record fresh from Terrain first
        public async Task<SignOffOutcome> SubmitStage(string memberId, OASStageListModel stage)
        {
            OASRecordingState state;
            try
            {
                state = await LoadStage(memberId, stage);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OAS sign off: load before submit failed");
                return new SignOffOutcome { State = SignOffOutcomeState.Failed, Message = "Couldn't load their record from Terrain." };
            }

            var result = await SubmitForReview(state);
            if (result.Success)
                return new SignOffOutcome { State = SignOffOutcomeState.Saved };
            return new SignOffOutcome
            {
                State = SignOffOutcomeState.Failed,
                Message = result.StatusCode > 0 ? $"Terrain didn't accept it (response {result.StatusCode})." : result.Body
            };
        }

        // Saving without the switch would send the change as the leader, so stop and say so
        private static TerrainWriteResult CouldNotActAsYouth(TerrainWriteResult assumed)
        {
            var reason = assumed.StatusCode > 0 ? $"Terrain said {assumed.StatusCode}." : assumed.Body;
            return new TerrainWriteResult
            {
                Success = false,
                Body = $"Terrain wouldn't let Beacon act as this youth, so nothing was saved. {reason}".Trim()
            };
        }

        public OASVerifier DefaultVerifier()
        {
            var profile = _storageService.GetProfilesResult?.profiles?.FirstOrDefault();
            var email = _storageService.GetUserResult?.UserAttributes?.FirstOrDefault(a => a.Name == "email")?.Value ?? "";
            return new OASVerifier
            {
                Type = OASRecording.VerifierTypeMember,
                Name = profile?.member?.name ?? "",
                Contact = email
            };
        }

        private string LeaderMemberId()
        {
            return _storageService.GetProfilesResult?.profiles?.FirstOrDefault()?.member?.id ?? "";
        }

        // Wallchart and insights data for the unit is cached, so drop it to pick up the change
        private void ClearUnitCaches()
        {
            _storageService.CachedWallchartItems.RemoveAll(c => c.Key == _storageService.UnitId);
        }
    }
}
