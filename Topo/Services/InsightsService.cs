using Topo.Model.Insights;
using System.Globalization;
using Topo.Model.OAS;
using Topo.Model.Progress;
using Topo.Model.Wallchart;

namespace Topo.Services
{
    public interface IInsightsService
    {
        public Task<InsightsReport> GetInsightsReport(string selectedUnitId, InsightsSettings settings);
        public Task<MemberInsightsReport> GetMemberInsights(ProgressDetailsPageViewModel progress, InsightsSettings settings);
    }

    public class InsightsService : IInsightsService
    {
        private readonly StorageService _storageService;
        private readonly IMembersService _membersService;
        private readonly IWallchartService _wallchartService;
        private readonly IOASService _oasService;
        private readonly ILogger<InsightsService> _logger;

        public InsightsService(StorageService storageService, IMembersService membersService, IWallchartService wallchartService, IOASService oasService, ILogger<InsightsService> logger)
        {
            _storageService = storageService;
            _membersService = membersService;
            _wallchartService = wallchartService;
            _oasService = oasService;
            _logger = logger;
        }

        public async Task<InsightsReport> GetInsightsReport(string selectedUnitId, InsightsSettings settings)
        {
            var section = _storageService.Section;
            var rules = settings.RulesFor(section);
            var today = DateTime.Today;

            // Wallchart items hold milestone, OAS, SIA and peak award progress per youth and are cached per unit
            var members = await _membersService.GetMembersAsync(selectedUnitId);
            var wallchartItems = await _wallchartService.GetWallchartItems(selectedUnitId);
            var youth = wallchartItems
                .Select(w =>
                {
                    var member = members.FirstOrDefault(m => m.id == w.MemberId);
                    return new YouthRecord
                    {
                        MemberId = w.MemberId,
                        MemberName = w.MemberName,
                        Patrol = w.MemberPatrol,
                        DateOfBirth = member?.date_of_birth,
                        Progress = w
                    };
                })
                .ToList();

            var candidates = InsightsCalculator.MoveUpCandidates(youth, rules, settings, today);
            var minStage = settings.MinimumStage(section);
            var highestStage = settings.MaximumStage(section);
            var demand = InsightsCalculator.NextStageDemand(youth, candidates.Select(c => c.MemberId).ToHashSet(), settings.IncludeNonCoreOAS, minStage, highestStage);
            var stagesForDetail = InsightsCalculator.StagesForDetail(demand, candidates, youth, settings.MaxGapStages, settings.IncludeNonCoreOAS, minStage, highestStage);

            var requirements = new List<OASRequirementStatus>();
            var stages = await _oasService.GetOASStagesList();
            foreach (var (stream, stageNumber) in stagesForDetail)
            {
                var stage = FindStage(stages, stream, stageNumber);
                if (stage == null)
                    continue;
                try
                {
                    var templateList = await _oasService.GetOASTemplate(stage.TemplateLink.Replace("/latest.json", ""));
                    var answers = await _oasService.GenerateOASWorksheetAnswers(selectedUnitId, stage, false, templateList);
                    requirements.AddRange(answers
                        .Where(a => !a.Awarded)
                        .Select(a => new OASRequirementStatus
                        {
                            Stream = stream,
                            Stage = stageNumber,
                            InputGroup = a.InputTitle,
                            InputLabel = a.InputLabel,
                            MemberId = a.MemberId,
                            Answered = a.Answered
                        }));
                }
                catch (Exception ex)
                {
                    // One stage failing should not stop the rest of the analysis
                    _logger.LogError(ex, $"Insights: unable to load OAS requirements for {stream} {stageNumber}");
                }
            }

            return InsightsCalculator.Build(section, youth, requirements, settings, today);
        }

        public async Task<MemberInsightsReport> GetMemberInsights(ProgressDetailsPageViewModel progress, InsightsSettings settings)
        {
            var rules = settings.RulesFor(_storageService.Section);
            var minStage = settings.MinimumStage(_storageService.Section);
            var highestStage = settings.MaximumStage(_storageService.Section);
            var youth = new YouthRecord
            {
                MemberId = progress.Member.id,
                MemberName = $"{progress.Member.first_name} {progress.Member.last_name}",
                Patrol = progress.Member.patrol_name,
                DateOfBirth = progress.Member.date_of_birth,
                Progress = ToWallchartItem(progress)
            };

            // Requirement detail for every stage in progress, plus the next stage of each core stream
            var startedStages = progress.OASSummaries
                .Where(o => o.Awarded == DateTime.MinValue && o.Approved == DateTime.MinValue)
                .Where(o => settings.IncludeNonCoreOAS || InsightsCalculator.IsCoreStream(o.Stream))
                .Where(o => o.Stage >= minStage && o.Stage <= highestStage)
                .Select(o => (o.Stream, o.Stage))
                .ToHashSet();
            var stagesForDetail = startedStages.ToList();
            foreach (var stream in InsightsCalculator.Streams.Where(s => s.IsCore))
            {
                var next = InsightsCalculator.StageFor(youth.Progress, stream.Key) + 1;
                if (next <= InsightsCalculator.MaxStage && next >= minStage && next <= highestStage && !stagesForDetail.Any(s => s.Stream == stream.Key))
                    stagesForDetail.Add((stream.Key, next));
            }

            var requirements = new List<OASRequirementStatus>();
            var stages = await _oasService.GetOASStagesList();
            foreach (var (stream, stageNumber) in stagesForDetail)
            {
                var template = progress.OASSummaries.FirstOrDefault(o => o.Stream == stream && o.Stage == stageNumber && !string.IsNullOrEmpty(o.Template))?.Template;
                var stage = template != null
                    ? stages.FirstOrDefault(s => s.TemplateLink == $"{template}/latest.json") ?? FindStage(stages, stream, stageNumber)
                    : FindStage(stages, stream, stageNumber);
                if (stage == null)
                    continue;
                try
                {
                    var templateList = await _oasService.GetOASTemplate(stage.TemplateLink.Replace("/latest.json", ""));
                    var answers = await _oasService.GenerateOASWorksheetAnswersForMember(_storageService.UnitId, stage, false, templateList, progress.Member.member_number);
                    requirements.AddRange(answers
                        .Where(a => !a.Awarded)
                        .Select(a => new OASRequirementStatus
                        {
                            Stream = stream,
                            Stage = stageNumber,
                            InputGroup = a.InputTitle,
                            InputLabel = a.InputLabel,
                            MemberId = youth.MemberId,
                            Answered = a.Answered
                        }));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Insights: unable to load OAS requirements for {stream} {stageNumber}");
                }
            }

            return MemberInsightsCalculator.Build(youth, requirements, startedStages, rules, DateTime.Today, settings.IncludeNonCoreOAS, minStage, highestStage);
        }

        // Shape the personal progress data like a wallchart row so the unit level calculations can be reused
        private WallchartItemModel ToWallchartItem(ProgressDetailsPageViewModel progress)
        {
            var item = new WallchartItemModel
            {
                MemberId = progress.Member.id,
                MemberName = $"{progress.Member.first_name} {progress.Member.last_name}",
                MemberPatrol = progress.Member.patrol_name,
                IntroToScouting = ParseDate(progress.IntroToScoutingDate),
                IntroToSection = ParseDate(progress.IntroToSectionDate),
                OASStageProgressions = progress.Stats.OasProgressions,
                LeadershipCourse = ParseDate(progress.PeakAward.PersonalDevelopmentCourse),
                AdventurousJourney = ParseDate(progress.PeakAward.AdventurousJourney),
                PersonalReflection = ParseDate(progress.PeakAward.PersonalReflection)
            };

            foreach (var milestone in progress.Milestones)
            {
                DateTime? awarded = milestone.Status == "Awarded" || milestone.Status == "Not Required" ? (milestone.Awarded == DateTime.MinValue ? DateTime.Today : milestone.Awarded) : null;
                var community = milestone.ParticipateLogs.Count(l => l.ChallengeArea == "community");
                var outdoors = milestone.ParticipateLogs.Count(l => l.ChallengeArea == "outdoors");
                var creative = milestone.ParticipateLogs.Count(l => l.ChallengeArea == "creative");
                var personalGrowth = milestone.ParticipateLogs.Count(l => l.ChallengeArea == "personal_growth");
                var leadAssist = milestone.LeadLogs.Count + milestone.AssistLogs.Count;
                switch (milestone.Milestone)
                {
                    case 1:
                        (item.Milestone1Community, item.Milestone1Outdoors, item.Milestone1Creative, item.Milestone1PersonalGrowth, item.Milestone1Lead, item.Milestone1Awarded) = (community, outdoors, creative, personalGrowth, leadAssist, awarded);
                        break;
                    case 2:
                        (item.Milestone2Community, item.Milestone2Outdoors, item.Milestone2Creative, item.Milestone2PersonalGrowth, item.Milestone2Lead, item.Milestone2Awarded) = (community, outdoors, creative, personalGrowth, leadAssist, awarded);
                        break;
                    case 3:
                        (item.Milestone3Community, item.Milestone3Outdoors, item.Milestone3Creative, item.Milestone3PersonalGrowth, item.Milestone3Lead, item.Milestone3Awarded) = (community, outdoors, creative, personalGrowth, leadAssist, awarded);
                        break;
                }
            }

            foreach (var stream in InsightsCalculator.Streams)
            {
                var highest = progress.OASSummaries
                    .Where(o => o.Stream == stream.Key && o.Awarded > DateTime.MinValue)
                    .Select(o => o.Stage)
                    .DefaultIfEmpty(0)
                    .Max();
                switch (stream.Key)
                {
                    case "bushcraft": item.OASBushcraftStage = highest; break;
                    case "bushwalking": item.OASBushwalkingStage = highest; break;
                    case "camping": item.OASCampingStage = highest; break;
                    case "alpine": item.OASAlpineStage = highest; break;
                    case "cycling": item.OASCyclingStage = highest; break;
                    case "vertical": item.OASVerticalStage = highest; break;
                    case "aquatics": item.OASAquaticsStage = highest; break;
                    case "boating": item.OASBoatingStage = highest; break;
                    case "paddling": item.OASPaddlingStage = highest; break;
                }
            }

            item.OASStagesInProgress = progress.OASSummaries
                .Where(o => o.Awarded == DateTime.MinValue && o.Approved == DateTime.MinValue)
                .Select(o => $"{o.Stream}/{o.Stage}")
                .Distinct()
                .ToList();

            var sectionInitial = _storageService.Section.ToLower().Substring(0, 1);
            item.OASSectionStagesAwarded = progress.OASSummaries
                .Where(o => o.Awarded > DateTime.MinValue && o.Section == sectionInitial)
                .Select(o => o.Stage)
                .ToList();

            // Only the total matters for the peak award check
            item.SIAAdventureSport = progress.SIASummaries.Count(s => s.Status == "Awarded");
            return item;
        }

        private DateTime? ParseDate(string date)
        {
            if (DateTime.TryParseExact(date, new[] { "dd/MM/yy", "dd/MM/yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) && parsed.Year > 1)
                return parsed;
            return null;
        }

        // Prefer the stream's main branch where a stage has several (e.g. alpine skiing / snowboarding)
        private OASStageListModel? FindStage(List<OASStageListModel> stages, string stream, int stageNumber)
        {
            var matches = stages
                .Where(s => s.Stream.Equals(stream, StringComparison.OrdinalIgnoreCase) && s.Stage == stageNumber && !string.IsNullOrEmpty(s.TemplateLink))
                .ToList();
            return matches.FirstOrDefault(s => s.Branch.Equals(stream, StringComparison.OrdinalIgnoreCase)) ?? matches.FirstOrDefault();
        }
    }
}
