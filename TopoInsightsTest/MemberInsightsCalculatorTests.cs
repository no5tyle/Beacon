using Newtonsoft.Json;
using Topo.Model.Insights;
using Topo.Model.OAS;
using Topo.Model.Wallchart;

namespace TopoInsightsTest
{
    [TestClass]
    public class MemberInsightsCalculatorTests
    {
        private static readonly DateTime Today = new DateTime(2026, 10, 22);
        private static readonly SectionRules ScoutRules = new InsightsSettings().RulesFor("scout");

        private static List<OASRequirementStatus> RequirementsFor(string memberId)
        {
            var json = File.ReadAllText(Path.Combine("ReportData", "OAS.json"));
            var answers = JsonConvert.DeserializeObject<List<OASWorksheetAnswers>>(json) ?? new List<OASWorksheetAnswers>();
            return answers
                .Where(a => a.MemberId == memberId)
                .Select(a => new OASRequirementStatus { Stream = "bushwalking", Stage = 3, InputGroup = a.InputTitle, InputLabel = a.InputLabel, MemberId = a.MemberId, Answered = a.Answered })
                .ToList();
        }

        private static YouthRecord Youth(string memberId)
        {
            return new YouthRecord
            {
                MemberId = memberId,
                MemberName = "Test Youth",
                Progress = new WallchartItemModel { MemberId = memberId, OASBushwalkingStage = 2, OASBushcraftStage = 3, OASCampingStage = 2 }
            };
        }

        private static HashSet<(string, int)> Started => new HashSet<(string, int)> { ("bushwalking", 3) };

        [TestMethod]
        public void NearlyFinishedStageGetsSingleUnitNightPlan()
        {
            // Only the two Review items are left for this member in the fixture
            const string memberId = "cd1929ca-d2a7-3922-b643-2c7678527d77";
            var report = MemberInsightsCalculator.Build(Youth(memberId), RequirementsFor(memberId), Started, ScoutRules, Today);

            var stage = report.Stages.Single();
            Assert.IsTrue(stage.IsClose);
            Assert.AreEqual(2, stage.Remaining.Count);

            var activity = report.CloseToComplete.Single(a => a.Kind == "OAS");
            StringAssert.StartsWith(activity.Title, "One unit night");
            Assert.IsTrue(activity.CoversAll);
            Assert.AreEqual("Review", activity.Steps.Single().Phase);
            Assert.AreEqual(2, activity.Steps.Single().Items.Count);
        }

        [TestMethod]
        public void OutingRequirementLeadsToOutingPlanWithPlanDoReview()
        {
            var requirements = RequirementsFor("cd1929ca-d2a7-3922-b643-2c7678527d77");
            requirements.Single(r => r.InputLabel.StartsWith("I have attended a day bushwalk")).Answered = false;
            requirements.Single(r => r.InputLabel.StartsWith("I can help plan a balanced menu")).Answered = false;
            var youth = Youth("cd1929ca-d2a7-3922-b643-2c7678527d77");
            youth.Progress.Milestone1Outdoors = 2;

            var report = MemberInsightsCalculator.Build(youth, requirements, Started, ScoutRules, Today);

            var activity = report.CloseToComplete.Single(a => a.Kind == "OAS");
            StringAssert.Contains(activity.Title, "day bushwalk");
            CollectionAssert.AreEqual(new[] { "Before: planning session", "On the day bushwalk", "After: review" }, activity.Steps.Select(s => s.Phase).ToArray());
            Assert.IsTrue(activity.Notes.Any(n => n.Contains("Milestone 1")), "Outing should be flagged as helping the Outdoors milestone count");
        }

        [TestMethod]
        public void RepeatedOutingRequirementIsFlagged()
        {
            var requirements = RequirementsFor("cd1929ca-d2a7-3922-b643-2c7678527d77");
            requirements.Single(r => r.InputLabel.StartsWith("I have attended at least two")).Answered = false;

            var report = MemberInsightsCalculator.Build(Youth("cd1929ca-d2a7-3922-b643-2c7678527d77"), requirements, Started, ScoutRules, Today);

            var activity = report.CloseToComplete.Single(a => a.Kind == "OAS");
            Assert.IsFalse(activity.CoversAll);
            Assert.IsTrue(activity.Notes.Any(n => n.Contains("at least two")));
        }

        [TestMethod]
        public void OneActivityFromMilestone()
        {
            var youth = Youth("m1");
            youth.Progress.Milestone1Awarded = Today.AddYears(-1);
            (youth.Progress.Milestone2Community, youth.Progress.Milestone2Outdoors, youth.Progress.Milestone2Creative, youth.Progress.Milestone2PersonalGrowth, youth.Progress.Milestone2Lead) = (5, 5, 4, 5, 4);

            var report = MemberInsightsCalculator.Build(youth, new List<OASRequirementStatus>(), new HashSet<(string, int)>(), ScoutRules, Today);

            Assert.IsNotNull(report.Milestone);
            Assert.AreEqual(2, report.Milestone!.Number);
            Assert.AreEqual(1, report.Milestone.Remaining);
            var activity = report.CloseToComplete.Single(a => a.Kind == "Milestone");
            Assert.IsTrue(activity.CoversAll);
            Assert.AreEqual("One more activity completes Milestone 2", activity.Title);
            StringAssert.StartsWith(activity.Summary, "Participate: Creative");
        }

        [TestMethod]
        public void MilestoneFarAwayIsNotClose()
        {
            var report = MemberInsightsCalculator.Build(Youth("m2"), new List<OASRequirementStatus>(), new HashSet<(string, int)>(), ScoutRules, Today);

            Assert.IsFalse(report.Milestone!.IsClose);
            Assert.IsFalse(report.CloseToComplete.Any());
            Assert.IsTrue(report.Highlights.Any(h => h.StartsWith("Milestone 1")));
        }

        [TestMethod]
        public void RecurringThemeAcrossStagesIsHighlighted()
        {
            const string memberId = "ee791361-6a3c-3db5-b7ff-1301283fa803";
            var requirements = RequirementsFor(memberId);
            requirements.Add(new OASRequirementStatus { Stream = "bushcraft", Stage = 4, InputGroup = "Do", InputLabel = "I can take a compass bearing and follow it.", MemberId = memberId });
            requirements.Add(new OASRequirementStatus { Stream = "bushcraft", Stage = 4, InputGroup = "Do", InputLabel = "I can tie a bowline.", MemberId = memberId });

            var report = MemberInsightsCalculator.Build(Youth(memberId), requirements, Started, ScoutRules, Today);

            var navigation = report.Themes.First();
            Assert.AreEqual("Navigation & Maps", navigation.Theme);
            CollectionAssert.AreEquivalent(new[] { "Bushwalking 3", "Bushcraft 4" }, navigation.Stages);
            Assert.IsTrue(report.Highlights.Any(h => h.StartsWith("Recurring gap: Navigation & Maps")));
            // Bushcraft 4 has nothing answered and was not started, so it is not "close"
            Assert.IsFalse(report.Stages.Single(s => s.Stream == "bushcraft").IsClose);
        }

        [TestMethod]
        public void NonCoreStagesHiddenButProgressionsStillCounted()
        {
            const string memberId = "cd1929ca-d2a7-3922-b643-2c7678527d77";
            var youth = Youth(memberId);
            youth.Progress.OASStageProgressions = 4;
            var requirements = RequirementsFor(memberId);
            requirements.Add(new OASRequirementStatus { Stream = "paddling", Stage = 2, InputGroup = "Do", InputLabel = "I can wear a PFD correctly.", MemberId = memberId });
            var started = new HashSet<(string, int)> { ("bushwalking", 3), ("paddling", 2) };

            var coreOnly = MemberInsightsCalculator.Build(youth, requirements, started, ScoutRules, Today);
            var all = MemberInsightsCalculator.Build(youth, requirements, started, ScoutRules, Today, includeNonCoreOAS: true);

            Assert.IsFalse(coreOnly.Stages.Any(s => s.Stream == "paddling"));
            Assert.IsFalse(coreOnly.CloseToComplete.Any(a => a.Target.StartsWith("Paddling")));
            Assert.IsFalse(coreOnly.Themes.Any(t => t.Theme == "Water Skills"));
            // The peak award progression requirement still reports the total across all streams
            var oas = coreOnly.PeakAwardTasks.Single(t => t.Key == "oas");
            Assert.IsFalse(oas.Done);
            StringAssert.StartsWith(oas.Detail, "4 of 10");
            Assert.IsTrue(all.Stages.Any(s => s.Stream == "paddling"));
        }

        [TestMethod]
        public void LowerStagesHiddenOnProgressPage()
        {
            const string memberId = "cd1929ca-d2a7-3922-b643-2c7678527d77";

            var report = MemberInsightsCalculator.Build(Youth(memberId), RequirementsFor(memberId), Started, ScoutRules, Today, minStage: 4);

            Assert.IsFalse(report.Stages.Any(), "Bushwalking 3 is below the minimum");
            Assert.IsFalse(report.CloseToComplete.Any());
        }

        [TestMethod]
        public void MoveUpDateUsesSectionAge()
        {
            var youth = Youth("m3");
            youth.DateOfBirth = Today.AddYears(-15).AddMonths(3);

            var report = MemberInsightsCalculator.Build(youth, new List<OASRequirementStatus>(), new HashSet<(string, int)>(), ScoutRules, Today);

            Assert.AreEqual(Today.AddMonths(3), report.MoveUpDate);
            Assert.IsTrue(report.Highlights.First().StartsWith("Moves up around"));
        }
    }
}
