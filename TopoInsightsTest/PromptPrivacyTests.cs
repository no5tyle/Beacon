using Topo.Model.Insights;

namespace TopoInsightsTest
{
    [TestClass]
    public class PromptPrivacyTests
    {
        [TestMethod]
        public void InitialsFromNames()
        {
            Assert.AreEqual("Z.G.", PromptPrivacy.Initials("Zimo", "Gu"));
            Assert.AreEqual("H.W.", PromptPrivacy.Initials("Hannah (Hai Yun)", "Wang"));
            Assert.AreEqual("M.O.", PromptPrivacy.Initials("mary-jane", "O'Neil"));
            Assert.AreEqual("A.V.D.B.", PromptPrivacy.Initials("Anna", "van den Berg"));
            Assert.AreEqual("Z.", PromptPrivacy.Initials("Zimo", ""));
            Assert.AreEqual("", PromptPrivacy.Initials("", ""));
        }

        [TestMethod]
        public void ScrubReplacesFullAndPartNames()
        {
            var text = PromptPrivacy.ScrubNames("Zimo Gu and Anne Rigney lead; anne and Zimo help. Annex stays.", new[] { "Zimo Gu", "Anne Rigney" });

            // Lower case single names are left as typed so ordinary words aren't changed
            Assert.AreEqual("Z.G. and A.R. lead; anne and Z.G. help. Annex stays.", text);
        }

        [TestMethod]
        public void ScrubHandlesEmptyInput()
        {
            Assert.AreEqual("", PromptPrivacy.ScrubNames("", new[] { "Zimo Gu" }));
            Assert.AreEqual("Nothing to change.", PromptPrivacy.ScrubNames("Nothing to change.", new string[0]));
        }
    }
}
