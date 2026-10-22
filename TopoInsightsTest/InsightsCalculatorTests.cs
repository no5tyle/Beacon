using Newtonsoft.Json;
using Topo.Model.Insights;
using Topo.Model.OAS;
using Topo.Model.Wallchart;

namespace TopoInsightsTest
{
    [TestClass]
    public class InsightsCalculatorTests
    {
        private static readonly DateTime Today = new DateTime(2026, 10, 22);

        private static List<WallchartItemModel> LoadWallchart()
        {
            var json = File.ReadAllText(Path.Combine("ReportData", "Wallchart.json"));
            return JsonConvert.DeserializeObject<List<WallchartItemModel>>(json) ?? new List<WallchartItemModel>();
        }

        private static List<OASWorksheetAnswers> LoadOAS()
        {
            var json = File.ReadAllText(Path.Combine("ReportData", "OAS.json"));
            return JsonConvert.DeserializeObject<List<OASWorksheetAnswers>>(json) ?? new List<OASWorksheetAnswers>();
        }

        private static List<YouthRecord> YouthFromWallchart()
        {
            return LoadWallchart()
                .Select(w => new YouthRecord { MemberId = w.MemberId, MemberName = w.MemberName, Patrol = w.MemberPatrol, Progress = w })
                .ToList();
        }

        // The OAS fixture is a Stage 3 Bushwalking worksheet, so give each of its members Stage 2 Bushwalking
        private static (List<YouthRecord> Youth, List<OASRequirementStatus> Requirements) BushwalkingStage3Unit()
        {
            var answers = LoadOAS();
            var youth = answers
                .GroupBy(a => a.MemberId)
                .Select(g => new YouthRecord
                {
                    MemberId = g.Key,
                    MemberName = g.First().MemberName,
                    Patrol = g.First().MemberPatrol,
                    Progress = new WallchartItemModel { MemberId = g.Key, OASBushwalkingStage = 2, OASBushcraftStage = 1, OASCampingStage = 1 }
                })
                .ToList();
            var requirements = answers
                .Select(a => new OASRequirementStatus
                {
                    Stream = "bushwalking",
                    Stage = 3,
                    InputGroup = a.InputTitle,
                    InputLabel = a.InputLabel,
                    MemberId = a.MemberId,
                    Answered = a.Answered
                })
                .ToList();
            return (youth, requirements);
        }

        [TestMethod]
        public void ClassifierGroupsRequirementsIntoThemes()
        {
            Assert.AreEqual("Navigation & Maps", SkillThemeClassifier.Classify("Do", "I can identify the features of a topographical map."));
            Assert.AreEqual("First Aid & Safety", SkillThemeClassifier.Classify("Do", "I know how to treat cuts and minor bleeding."));
            Assert.AreEqual("Gear & Packing", SkillThemeClassifier.Classify("Plan>", "I can help a Stage 1 Scout to pack their backpack for a bushwalk."));
            Assert.AreEqual("Weather & Environment", SkillThemeClassifier.Classify("Plan", "I know how and where to get the latest weather forecast for the area I will be bushwalking in."));
            Assert.AreEqual(SkillThemeClassifier.ReviewTheme, SkillThemeClassifier.Classify("Review", "I have discussed the top five things I have learnt throughout Stages 1-3 of Bushwalking."));
            Assert.AreEqual(SkillThemeClassifier.VerifyTheme, SkillThemeClassifier.Classify("Verify", "My logbook is up to date at the end of this stage."));
        }

        [TestMethod]
        public void OutingRequirementsAreNotUnitNightSuitable()
        {
            Assert.IsFalse(SkillThemeClassifier.IsUnitNightSuitable("Do", "I have attended a day bushwalk at this stage of at least six hours duration."));
            Assert.IsFalse(SkillThemeClassifier.IsUnitNightSuitable("Do", "I have attended at least two bushwalking activities at this stage."));
            Assert.IsFalse(SkillThemeClassifier.IsUnitNightSuitable("Verify", "My logbook is up to date at the end of this stage."));
            Assert.IsTrue(SkillThemeClassifier.IsUnitNightSuitable("Do", "I know how to treat cuts and minor bleeding."));
            Assert.IsTrue(SkillThemeClassifier.IsUnitNightSuitable("Plan", "I have considered bushwalking etiquette when planning for a journey."));
            Assert.AreEqual(SkillThemeClassifier.OutingTheme, SkillThemeClassifier.Classify("Do", "I have attended at least two bushwalking activities at this stage."));
        }

        [TestMethod]
        public void StreamCoverageMatchesWallchart()
        {
            var youth = YouthFromWallchart();
            var coverage = InsightsCalculator.StreamCoverage(youth, includeNonCore: true);

            Assert.AreEqual(InsightsCalculator.Streams.Count, coverage.Count);
            foreach (var stream in coverage)
            {
                Assert.AreEqual(youth.Count - stream.NotStarted, stream.ReachedStage[1], stream.Stream);
                for (int stage = 2; stage <= InsightsCalculator.MaxStage; stage++)
                    Assert.IsTrue(stream.ReachedStage[stage] <= stream.ReachedStage[stage - 1]);
            }
            var bushwalking = coverage.Single(c => c.Stream == "bushwalking");
            Assert.AreEqual(youth.Count(y => y.Progress.OASBushwalkingStage == 0), bushwalking.NotStarted);
            for (int stage = 1; stage <= InsightsCalculator.MaxStage; stage++)
            {
                Assert.IsTrue(bushwalking.NextStageMemberIds[stage].All(id => youth.Single(y => y.MemberId == id).Progress.OASBushwalkingStage == stage - 1));
            }
            // Each youth appears once, unless they've completed every stage
            var listed = Enumerable.Range(1, InsightsCalculator.MaxStage).SelectMany(stage => bushwalking.NextStageMemberIds[stage]).ToList();
            Assert.AreEqual(listed.Count, listed.Distinct().Count());
            Assert.AreEqual(youth.Count(y => y.Progress.OASBushwalkingStage < InsightsCalculator.MaxStage), listed.Count);
        }

        [TestMethod]
        public void CoreStreamsOnlyByDefault()
        {
            var youth = YouthFromWallchart();

            var coverage = InsightsCalculator.StreamCoverage(youth);
            var demand = InsightsCalculator.NextStageDemand(youth, new HashSet<string>());

            CollectionAssert.AreEquivalent(new[] { "bushcraft", "bushwalking", "camping" }, coverage.Select(c => c.Stream).ToArray());
            Assert.IsTrue(demand.All(d => InsightsCalculator.IsCoreStream(d.Stream)));
        }

        [TestMethod]
        public void NonCoreRequirementsExcludedUnlessRequested()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            youth.ForEach(y => y.Progress.OASAquaticsStage = 2);
            requirements.AddRange(youth.Select(y => new OASRequirementStatus { Stream = "aquatics", Stage = 3, InputGroup = "Do", InputLabel = "I can perform a rescue using a throw bag.", MemberId = y.MemberId }));

            var coreOnly = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings { SectionStagesOnly = false }, Today);
            var all = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings { IncludeNonCoreOAS = true, SectionStagesOnly = false }, Today);

            Assert.IsFalse(coreOnly.RequirementGaps.Any(g => g.Stream == "aquatics"));
            Assert.IsFalse(coreOnly.SkillThemes.Any(t => t.Name == "Water Skills"));
            Assert.IsTrue(all.RequirementGaps.Any(g => g.Stream == "aquatics"));
        }

        [TestMethod]
        public void NextStageDemandSkipsUnstartedOptionalStreams()
        {
            var youth = YouthFromWallchart();
            var demand = InsightsCalculator.NextStageDemand(youth, new HashSet<string>(), includeNonCore: true);

            var boatingStage1 = demand.SingleOrDefault(d => d.Stream == "boating" && d.Stage == 1);
            Assert.IsNull(boatingStage1, "Boating stage 1 should not be demanded by youth who have not started boating");
            // Every youth appears exactly once per core stream
            foreach (var core in InsightsCalculator.Streams.Where(s => s.IsCore))
                Assert.AreEqual(youth.Count, demand.Where(d => d.Stream == core.Key).Sum(d => d.Count), core.Key);
        }

        [TestMethod]
        public void MoveUpCandidatesUseSectionAgeAndWindow()
        {
            var youth = YouthFromWallchart();
            youth[0].DateOfBirth = Today.AddYears(-15).AddMonths(2);  // 2 months to go
            youth[1].DateOfBirth = Today.AddYears(-15).AddMonths(5);  // 5 months to go
            youth[2].DateOfBirth = Today.AddYears(-12);               // 3 years to go
            var settings = new InsightsSettings();
            var rules = settings.RulesFor("scout");

            var candidates = InsightsCalculator.MoveUpCandidates(youth, rules, settings, Today);

            Assert.AreEqual(2, candidates.Count);
            Assert.AreEqual(youth[0].MemberId, candidates[0].MemberId);
            Assert.AreEqual(Urgency.High, candidates[0].Urgency);
            Assert.AreEqual(Urgency.Medium, candidates[1].Urgency);

            // Damian Au in the fixture has not done Milestone 3 and has 2 stage progressions
            var oas = candidates[0].Tasks.Single(t => t.Key == "oas");
            Assert.IsFalse(oas.Done);
            StringAssert.StartsWith(oas.Detail, "2 of 10");
            var milestone = candidates[0].Tasks.Single(t => t.Key == "milestone");
            Assert.IsFalse(milestone.Done);
            StringAssert.Contains(milestone.Detail, "Milestone 1");
        }

        [TestMethod]
        public void PeakAwardOASFollowsTerrainWording()
        {
            var settings = new InsightsSettings();
            var youth = new YouthRecord
            {
                MemberId = "y",
                Progress = new WallchartItemModel { OASBushcraftStage = 5, OASBushwalkingStage = 6, OASCampingStage = 4, OASStageProgressions = 11, OASSectionStagesAwarded = new List<int> { 4, 4, 5, 6, 7, 2 } }
            };

            var scout = InsightsCalculator.PeakAwardTasks(youth, settings.RulesFor("scout"), new List<OASRequirementStatus>());
            Assert.IsTrue(scout.Single(t => t.Key == "oas").Done, "11 of 10 progressions");
            var core = scout.Single(t => t.Key == "oas:core");
            Assert.AreEqual("Stage 5 in all core OAS", core.Title);
            Assert.IsFalse(core.Done);
            Assert.AreEqual("Below Stage 5: Camping 4", core.Detail);
            Assert.IsFalse(scout.Any(t => t.Key == "oas:high"), "Scouts have no Stage 4+ rule");

            var venturer = InsightsCalculator.PeakAwardTasks(youth, settings.RulesFor("venturer"), new List<OASRequirementStatus>());
            Assert.IsFalse(venturer.Single(t => t.Key == "oas").Done, "11 of 12 progressions");
            var high = venturer.Single(t => t.Key == "oas:high");
            Assert.IsTrue(high.Done);
            Assert.AreEqual("5 of 4", high.Detail);

            var joey = InsightsCalculator.PeakAwardTasks(youth, settings.RulesFor("joey"), new List<OASRequirementStatus>());
            Assert.IsFalse(joey.Any(t => t.Key == "oas"), "Joeys have no progression count");
            Assert.IsTrue(joey.Single(t => t.Key == "oas:core").Done);
        }

        [TestMethod]
        public void FocusYouthAreTreatedAsPriority()
        {
            var youth = YouthFromWallchart();
            youth[0].DateOfBirth = Today.AddYears(-15).AddMonths(2);   // moving up
            youth[1].DateOfBirth = Today.AddYears(-12);                // not moving up, picked as focus
            youth[2].DateOfBirth = null;                               // no birth date, picked as focus
            var focus = new[] { youth[1].MemberId, youth[2].MemberId };
            var settings = new InsightsSettings();

            var candidates = InsightsCalculator.MoveUpCandidates(youth, settings.RulesFor("scout"), settings, Today, null, focus);

            Assert.AreEqual(3, candidates.Count);
            var movingUp = candidates.Single(c => c.MemberId == youth[0].MemberId);
            Assert.IsTrue(movingUp.IsMovingUp);
            Assert.IsFalse(movingUp.IsFocus);
            var picked = candidates.Single(c => c.MemberId == youth[1].MemberId);
            Assert.IsTrue(picked.IsFocus);
            Assert.IsFalse(picked.IsMovingUp);
            Assert.AreEqual(Urgency.Medium, picked.Urgency);
            var noBirthDate = candidates.Single(c => c.MemberId == youth[2].MemberId);
            Assert.IsNull(noBirthDate.MoveUpDate);
            Assert.IsTrue(noBirthDate.Tasks.Any());
            Assert.AreEqual(youth[0].MemberId, candidates.First().MemberId, "Youth moving up within 3 months still come first");
        }

        [TestMethod]
        public void FocusYouthWeightRequirementGaps()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            var focusId = youth[0].MemberId;

            var report = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings { SectionStagesOnly = false }, Today, new[] { focusId });

            Assert.IsTrue(report.MoveUpCandidates.Single().IsFocus);
            Assert.IsTrue(report.RequirementGaps.Where(g => g.OutstandingMemberIds.Contains(focusId)).All(g => g.PriorityMemberCount == 1));
        }

        [TestMethod]
        public void PriorityTaskBoardGroupsOutstandingTasks()
        {
            var youth = YouthFromWallchart();
            youth[0].DateOfBirth = Today.AddYears(-15).AddMonths(1);
            youth[1].DateOfBirth = Today.AddYears(-15).AddMonths(4);
            var settings = new InsightsSettings();
            var candidates = InsightsCalculator.MoveUpCandidates(youth, settings.RulesFor("scout"), settings, Today);

            var board = InsightsCalculator.PriorityTaskBoard(candidates);
            var aj = board.Single(t => t.Key == "peak:aj");
            Assert.AreEqual(2, aj.MemberNames.Count);
            Assert.AreEqual(1, aj.HighUrgencyCount);
        }

        [TestMethod]
        public void RequirementGapsCountOutstandingMembers()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            var gaps = InsightsCalculator.RequirementGaps(youth, requirements, new HashSet<string>());

            Assert.IsTrue(gaps.Any());
            Assert.IsFalse(gaps.Any(g => g.InputGroup == "Verify"), "Logbook check is not a programme item");
            foreach (var gap in gaps)
            {
                Assert.IsTrue(gap.OutstandingCount <= gap.CandidateCount);
                var expected = requirements.Count(r => r.InputLabel == gap.InputLabel && !r.Answered);
                Assert.AreEqual(expected, gap.OutstandingCount, gap.InputLabel);
            }
        }

        [TestMethod]
        public void RequirementGapsIgnoreYouthNotOnThatStage()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            var skipped = youth[0];
            skipped.Progress.OASBushwalkingStage = 3;

            var gaps = InsightsCalculator.RequirementGaps(youth, requirements, new HashSet<string>());

            Assert.IsFalse(gaps.Any(g => g.OutstandingMemberIds.Contains(skipped.MemberId)));
        }

        [TestMethod]
        public void EligibilityFollowsTerrainCreditRule()
        {
            var progress = new WallchartItemModel { OASBushwalkingStage = 2 };

            Assert.IsTrue(InsightsCalculator.IsEligible(progress, "bushwalking", 3), "Next stage");
            Assert.IsTrue(InsightsCalculator.IsEligible(progress, "bushwalking", 5), "Stage 5 needs Stage 2");
            Assert.IsFalse(InsightsCalculator.IsEligible(progress, "bushwalking", 6), "Stage 6 needs Stage 3");
            Assert.IsFalse(InsightsCalculator.IsEligible(progress, "bushwalking", 2), "Already complete");
            Assert.IsTrue(InsightsCalculator.IsEligible(new WallchartItemModel(), "camping", 3), "Stages 1 to 3 are open to everyone");
            Assert.IsFalse(InsightsCalculator.IsEligible(new WallchartItemModel(), "camping", 4));
        }

        [TestMethod]
        public void GapsCountEligibleAndActiveYouthSeparately()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            // One youth hasn't started bushwalking at all but can still work on Stage 3
            youth[0].Progress.OASBushwalkingStage = 0;
            // Two youth have started Stage 3 in Terrain
            youth[1].Progress.OASStagesInProgress.Add("bushwalking/3");
            youth[2].Progress.OASStagesInProgress.Add("bushwalking/3");

            var gaps = InsightsCalculator.RequirementGaps(youth, requirements, new HashSet<string>());

            var gap = gaps.First();
            Assert.AreEqual(youth.Count, gap.CandidateCount, "Everyone who hasn't completed Stage 3 is eligible");
            Assert.AreEqual(0, gap.CompletedCount);
            Assert.AreEqual(2, gap.ActiveCandidateCount);
            Assert.IsTrue(gap.ActiveOutstandingMemberIds.All(id => id == youth[1].MemberId || id == youth[2].MemberId));
            Assert.IsTrue(gaps.Any(g => g.OutstandingMemberIds.Contains(youth[0].MemberId)));
        }

        [TestMethod]
        public void CompletedYouthCountTowardsTotalButNotOutstanding()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            var finished = youth[0];
            finished.Progress.OASBushwalkingStage = 4;

            var gap = InsightsCalculator.RequirementGaps(youth, requirements, new HashSet<string>()).First();

            Assert.AreEqual(1, gap.CompletedCount);
            Assert.AreEqual(youth.Count, gap.CandidateCount, "Completed youth stay in the total");
            Assert.IsFalse(gap.OutstandingMemberIds.Contains(finished.MemberId));
        }

        [TestMethod]
        public void LowerStagesHiddenForSection()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            requirements.AddRange(youth.Select(y => new OASRequirementStatus { Stream = "bushwalking", Stage = 4, InputGroup = "Do", InputLabel = "I can plan a route.", MemberId = y.MemberId }));

            var scouts = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings(), Today);
            var cubs = InsightsCalculator.Build("cub", youth, requirements, new InsightsSettings(), Today);
            var shown = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings { SectionStagesOnly = false }, Today);

            Assert.AreEqual(4, scouts.MinimumStage);
            Assert.IsTrue(scouts.RequirementGaps.All(g => g.Stage >= 4), "Scouts hide Stage 3 and below");
            Assert.IsTrue(scouts.RequirementGaps.Any(g => g.Stage == 4));
            Assert.IsTrue(scouts.NextStageDemand.All(d => d.Stage >= 4));
            Assert.AreEqual(2, cubs.MinimumStage);
            Assert.IsTrue(cubs.RequirementGaps.Any(g => g.Stage == 3), "Cubs only hide Stage 1");
            Assert.AreEqual(1, shown.MinimumStage);
            Assert.IsTrue(shown.RequirementGaps.Any(g => g.Stage == 3));
        }

        [TestMethod]
        public void StagesAboveSectionHidden()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            youth.ForEach(y => y.Progress.OASBushwalkingStage = 3);
            foreach (var stage in new[] { 4, 5, 6 })
                requirements.AddRange(youth.Select(y => new OASRequirementStatus { Stream = "bushwalking", Stage = stage, InputGroup = "Do", InputLabel = $"Stage {stage} skill.", MemberId = y.MemberId }));

            var scouts = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings(), Today);
            var all = InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings { SectionStagesOnly = false }, Today);

            Assert.AreEqual(5, scouts.MaximumStage);
            CollectionAssert.AreEquivalent(new[] { 4, 5 }, scouts.RequirementGaps.Select(g => g.Stage).Distinct().ToArray(), "Scouts see Stages 4 and 5 only");
            Assert.IsTrue(all.RequirementGaps.Any(g => g.Stage == 6));

            var settings = new InsightsSettings();
            Assert.AreEqual((1, 1), (settings.MinimumStage("joey"), settings.MaximumStage("joey")));
            Assert.AreEqual((2, 3), (settings.MinimumStage("cub"), settings.MaximumStage("cub")));
            settings.SectionStagesOnly = false;
            Assert.AreEqual((1, 9), (settings.MinimumStage("cub"), settings.MaximumStage("cub")));
        }

        [TestMethod]
        public void DetailStagesIncludeActiveWork()
        {
            var youth = YouthFromWallchart();
            youth.ForEach(y => y.Progress.OASStagesInProgress = new List<string> { "camping/4", "paddling/2" });
            var demand = InsightsCalculator.NextStageDemand(youth, new HashSet<string>());

            var stages = InsightsCalculator.StagesForDetail(demand, new List<MoveUpCandidate>(), youth, 1);

            CollectionAssert.AreEqual(new[] { ("camping", 4) }, stages, "Most active core stage wins; non-core is left out");
        }

        [TestMethod]
        public void BuildProducesProgrammeSuggestions()
        {
            var (youth, requirements) = BushwalkingStage3Unit();
            youth[0].DateOfBirth = Today.AddYears(-15).AddMonths(2);
            var settings = new InsightsSettings { SuggestedNights = 4, SectionStagesOnly = false };

            var report = InsightsCalculator.Build("scout", youth, requirements, settings, Today);

            Assert.AreEqual(youth.Count, report.YouthCount);
            Assert.AreEqual(1, report.MoveUpCandidates.Count);
            Assert.IsTrue(report.SkillThemes.Any(t => t.Name == "Navigation & Maps"));
            Assert.IsTrue(report.SkillThemes.All(t => t.Requirements.All(r => r.UnitNightSuitable)));
            Assert.IsTrue(report.SuggestedNights.Count is > 0 and <= 4);
            CollectionAssert.AreEqual(Enumerable.Range(1, report.SuggestedNights.Count).ToList(), report.SuggestedNights.Select(n => n.Number).ToList());
            // Challenge area balance night is included because nobody in the synthetic unit has milestone progress
            Assert.IsTrue(report.SuggestedNights.Any(n => n.Title.EndsWith("challenge night")));
        }
    }
}
