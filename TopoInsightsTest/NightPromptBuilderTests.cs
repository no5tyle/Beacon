using Newtonsoft.Json;
using Topo.Model.Insights;
using Topo.Model.OAS;
using Topo.Model.Wallchart;

namespace TopoInsightsTest
{
    [TestClass]
    public class NightPromptBuilderTests
    {
        private static readonly DateTime Today = new DateTime(2026, 10, 22);

        private static (InsightsReport Report, List<OASWorksheetAnswers> Answers) UnitReport()
        {
            var json = File.ReadAllText(Path.Combine("ReportData", "OAS.json"));
            var answers = JsonConvert.DeserializeObject<List<OASWorksheetAnswers>>(json) ?? new List<OASWorksheetAnswers>();
            var youth = answers
                .GroupBy(a => a.MemberId)
                .Select(g => new YouthRecord
                {
                    MemberId = g.Key,
                    MemberName = g.First().MemberName,
                    Patrol = g.First().MemberPatrol,
                    Progress = new WallchartItemModel { MemberId = g.Key, OASBushwalkingStage = 2 }
                })
                .ToList();
            youth[0].DateOfBirth = Today.AddYears(-15).AddMonths(2);
            var requirements = answers
                .Select(a => new OASRequirementStatus { Stream = "bushwalking", Stage = 3, InputGroup = a.InputTitle, InputLabel = a.InputLabel, MemberId = a.MemberId, Answered = a.Answered })
                .ToList();
            return (InsightsCalculator.Build("scout", youth, requirements, new InsightsSettings { SectionStagesOnly = false }, Today), answers);
        }

        [TestMethod]
        public void ContainsNoYouthNames()
        {
            var (report, answers) = UnitReport();

            var prompt = NightPromptBuilder.Build(report, "Scouts", Today, false, 90);

            foreach (var name in answers.Select(a => a.MemberName).Distinct())
            {
                Assert.IsFalse(prompt.Contains(name), $"Youth name {name} must not appear");
                Assert.IsFalse(prompt.Contains(name.Split(' ')[0] + " "), $"First name of {name} must not appear");
            }
            foreach (var id in answers.Select(a => a.MemberId).Distinct())
                Assert.IsFalse(prompt.Contains(id));
        }

        [TestMethod]
        public void YouthNamedInNotesBecomeInitials()
        {
            var (report, answers) = UnitReport();
            var name = answers.First().MemberName;
            var firstName = name.Split(' ')[0];

            var prompt = NightPromptBuilder.Build(report, "Scouts", Today, false, 90, $"{name} and {firstName} can run a base.");

            Assert.IsFalse(prompt.Contains(firstName), "Youth first name must not appear");
            var initials = PromptPrivacy.Initials(firstName, name.Substring(firstName.Length));
            StringAssert.Contains(prompt, $"{initials} and {initials} can run a base.");
        }

        [TestMethod]
        public void FocusesOnUnitNightRequirements()
        {
            var (report, _) = UnitReport();

            var prompt = NightPromptBuilder.Build(report, "Scouts", Today, false, 120, "Hall only, 24 Scouts, 4 leaders.");

            StringAssert.Contains(prompt, "one 120 minute unit night for my Scouts unit");
            StringAssert.Contains(prompt, "core OAS (Bushcraft, Bushwalking, Camping)");
            StringAssert.Contains(prompt, "Navigation & Maps (");
            StringAssert.Contains(prompt, "Bushwalking Stage 3 [Do] I can identify the features of a topographical map.");
            Assert.IsFalse(prompt.Contains("I have attended a day bushwalk"), "Outing-only requirements are left out");
            Assert.IsFalse(prompt.Contains("My logbook is up to date"), "Logbook check is left out");
            StringAssert.Contains(prompt, "1 priority youth: 1 moving up to the next section");
            StringAssert.Contains(prompt, "Hall only, 24 Scouts, 4 leaders.");
            StringAssert.Contains(prompt, "A timed run sheet");
        }
    }
}
