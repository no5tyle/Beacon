using Topo.Model.Insights;
using Topo.Model.Wallchart;

namespace TopoInsightsTest
{
    [TestClass]
    public class PlanPromptBuilderTests
    {
        private static readonly DateTime Today = new DateTime(2026, 10, 22);
        private static readonly DateTime DateOfBirth = Today.AddYears(-15).AddMonths(3);

        private static MemberInsightsReport Insights()
        {
            var youth = new YouthRecord
            {
                MemberId = "member-guid-123",
                MemberName = "Zimo Gu",
                DateOfBirth = DateOfBirth,
                Progress = new WallchartItemModel
                {
                    MemberId = "member-guid-123",
                    Milestone1Awarded = Today.AddYears(-1),
                    Milestone2Community = 5, Milestone2Outdoors = 4, Milestone2Creative = 5, Milestone2PersonalGrowth = 5, Milestone2Lead = 4,
                    OASBushwalkingStage = 2,
                    IntroToScouting = Today.AddYears(-2)
                }
            };
            var requirements = new List<OASRequirementStatus>
            {
                new OASRequirementStatus { Stream = "bushwalking", Stage = 3, InputGroup = "Do", InputLabel = "I can identify the features of a topographical map.", MemberId = youth.MemberId },
                new OASRequirementStatus { Stream = "bushwalking", Stage = 3, InputGroup = "Do", InputLabel = "I have attended a day bushwalk at this stage of at least six hours duration.", MemberId = youth.MemberId },
                new OASRequirementStatus { Stream = "bushwalking", Stage = 3, InputGroup = "Plan", InputLabel = "I can list places where I can and cannot bushwalk.", MemberId = youth.MemberId, Answered = true },
            };
            return MemberInsightsCalculator.Build(youth, requirements, new HashSet<(string, int)> { ("bushwalking", 3) }, new InsightsSettings().RulesFor("scout"), Today);
        }

        [TestMethod]
        public void UsesInitialsOnlyAndNoIdentifiers()
        {
            var prompt = PlanPromptBuilder.Build(Insights(), "Zimo", "Gu", false, "Scouts", Today, false);

            StringAssert.Contains(prompt, "Z.G.");
            Assert.IsFalse(prompt.Contains("Zimo"), "First name must not appear");
            Assert.IsFalse(prompt.Contains(" Gu"), "Surname must not appear");
            Assert.IsFalse(prompt.Contains("member-guid-123"), "Member id must not appear");
            Assert.IsFalse(prompt.Contains(DateOfBirth.ToString("d MMMM yyyy")), "Date of birth must not appear");
            Assert.IsFalse(prompt.Contains(DateOfBirth.ToString("dd/MM/yyyy")), "Date of birth must not appear");
        }

        [TestMethod]
        public void LeaveOutInitialsRemovesThem()
        {
            var prompt = PlanPromptBuilder.Build(Insights(), "Zimo", "Gu", true, "Scouts", Today, false, "Zimo is keen on the November camp.");

            Assert.IsFalse(prompt.Contains("Zimo"));
            Assert.IsFalse(prompt.Contains("Z.G."));
            StringAssert.Contains(prompt, "this youth member");
            StringAssert.Contains(prompt, "the youth member is keen on the November camp.");
        }

        [TestMethod]
        public void NamesInLeaderNotesBecomeInitials()
        {
            var prompt = PlanPromptBuilder.Build(Insights(), "Zimo", "Gu", false, "Scouts", Today, false, "Zimo Gu wants to lead. Zimo is going on the camp.");

            StringAssert.Contains(prompt, "Z.G. wants to lead. Z.G. is going on the camp.");
            Assert.IsFalse(prompt.Contains("Zimo"));
        }

        [TestMethod]
        public void IncludesOutstandingWorkAndGuardrails()
        {
            var prompt = PlanPromptBuilder.Build(Insights(), "Zimo", "Gu", false, "Scouts", Today, false, "Camp on 14 November.");

            StringAssert.Contains(prompt, "## Australian Scout Award");
            StringAssert.Contains(prompt, "- Adventurous Journey");
            StringAssert.Contains(prompt, "Outdoors participates: 4 of 5");
            StringAssert.Contains(prompt, "Core OAS (Bushcraft, Bushwalking, Camping)");
            StringAssert.Contains(prompt, "[Do] I can identify the features of a topographical map. (unit night)");
            StringAssert.Contains(prompt, "at least six hours duration. (needs an outing)");
            Assert.IsFalse(prompt.Contains("I can list places where I can and cannot bushwalk."), "Completed requirements are left out");
            StringAssert.Contains(prompt, "Camp on 14 November.");
            StringAssert.Contains(prompt, "about 3 months away");
            StringAssert.Contains(prompt, "Don't invent, reword or change Scouts Australia requirements");
        }
    }
}
