using Newtonsoft.Json;
using Topo.Model.OAS;

namespace TopoInsightsTest
{
    [TestClass]
    public class OASReferenceTests
    {
        private static T Load<T>(string file) => JsonConvert.DeserializeObject<T>(File.ReadAllText(Path.Combine("ReportData", file)))!;

        private static List<OASReferenceStatement> Bushwalking3()
        {
            var stage = new OASReferenceStage { Stream = "bushwalking", StreamTitle = "Bushwalking", Stage = 3, TemplateLink = "oas/bushwalking/3/latest.json" };
            return OASReference.Statements(stage, Load<GetOASTemplateResultModel>("oas-bushwalking-3-template.json"));
        }

        [TestMethod]
        public void StagesIncludeEveryBranch()
        {
            var stages = OASReference.Stages(Load<GetOASTreeResultsModel>("oas-alpine-tree.json"));

            Assert.AreEqual(27, stages.Count, "Stages 1-3 plus four branches from Stage 4 to 9");
            Assert.AreEqual("Alpine Stage 1", stages[0].Title);
            Assert.IsTrue(stages.Any(s => s.Title == "Alpine · Snowboarding Stage 7"));
            Assert.AreEqual(stages.Count, stages.Select(s => s.TemplateLink).Distinct().Count());
        }

        [TestMethod]
        public void StatementsComeFromVerifiableCheckboxesWithExplanations()
        {
            var statements = Bushwalking3();

            Assert.AreEqual(17, statements.Count, "Logbook and file upload are left out");
            Assert.IsTrue(statements.All(s => OASReference.Parts.Contains(s.Part)));
            var navigation = statements.Single(s => s.Label.StartsWith("I have run a small navigational activity"));
            StringAssert.StartsWith(navigation.Detail, "Activity should take no more than an hour");
            Assert.AreEqual("Navigation & Maps", navigation.Theme);
            Assert.IsTrue(navigation.UnitNightSuitable);
            Assert.IsFalse(statements.Single(s => s.Label.StartsWith("I have attended a day bushwalk")).UnitNightSuitable);
        }

        [TestMethod]
        public void FilterBySearchPartAndWhere()
        {
            var statements = Bushwalking3();

            var compass = OASReference.Filter(statements, new OASReferenceFilter { Search = "compass" });
            Assert.IsTrue(compass.Any());
            Assert.IsTrue(compass.All(s => (s.Label + s.Detail).Contains("compass", StringComparison.OrdinalIgnoreCase)), "Search matches the explanation too");

            Assert.AreEqual(2, OASReference.Filter(statements, new OASReferenceFilter { Part = "Review" }).Count);
            Assert.IsTrue(OASReference.Filter(statements, new OASReferenceFilter { Where = OASReferenceWhere.Outing }).All(s => !s.UnitNightSuitable));
            Assert.AreEqual(0, OASReference.Filter(statements, new OASReferenceFilter { Stages = new HashSet<int> { 4, 5 } }).Count);
            Assert.AreEqual(statements.Count, OASReference.Filter(statements, new OASReferenceFilter { Stages = new HashSet<int> { 2, 3 } }).Count, "Any selected stage matches");
            Assert.AreEqual(0, OASReference.Filter(statements, new OASReferenceFilter { Streams = new HashSet<string> { "camping" } }).Count);
            Assert.AreEqual(0, OASReference.Filter(statements, new OASReferenceFilter { Search = "compass zzzz" }).Count, "Every search word must match");
        }

        [TestMethod]
        public void KeysAreStableAndFilterTheStarredList()
        {
            var statements = Bushwalking3();
            var menu = statements.Single(s => s.InputId == "help_plan_bushwalking_balanced_menu_542939");

            Assert.AreEqual("bushwalking/3:help_plan_bushwalking_balanced_menu_542939", menu.Key);
            Assert.AreEqual("bushwalking", OASReference.StreamOfKey(menu.Key));
            Assert.AreEqual("alpine", OASReference.StreamOfKey("alpine/snowboarding/5:abc"));
            Assert.AreEqual(statements.Count, statements.Select(s => s.Key).Distinct().Count());

            var starred = OASReference.Filter(statements, new OASReferenceFilter { Keys = new HashSet<string> { menu.Key } });
            Assert.AreEqual(menu.Key, starred.Single().Key);
        }

        [TestMethod]
        public void LinksRoundTrip()
        {
            var link = new OASReferenceLink
            {
                Stream = "bushwalking",
                Stages = new List<int> { 5, 2 },
                Part = "Do",
                Theme = "Navigation & Maps",
                Where = OASReferenceWhere.UnitNight,
                Search = "compass bearing",
                Starred = true
            };
            var query = link.ToQuery();
            Assert.AreEqual("?stream=bushwalking&stage=2%2C5&part=Do&theme=Navigation%20%26%20Maps&where=UnitNight&q=compass%20bearing&view=starred", query);

            var parsed = OASReferenceLink.Parse(query);
            Assert.AreEqual("bushwalking", parsed.Stream);
            CollectionAssert.AreEqual(new List<int> { 2, 5 }, parsed.Stages);
            Assert.AreEqual("Navigation & Maps", parsed.Theme);
            Assert.AreEqual(OASReferenceWhere.UnitNight, parsed.Where);
            Assert.AreEqual("compass bearing", parsed.Search);
            Assert.IsTrue(parsed.Starred);

            Assert.AreEqual("", new OASReferenceLink().ToQuery());
            Assert.AreEqual("bushwalking/3:abc", OASReferenceLink.Parse("?s=bushwalking%2F3%3Aabc&stage=x,0").Statement);
            Assert.AreEqual(0, OASReferenceLink.Parse("?stage=x,0").Stages.Count, "Bad stage numbers are ignored");
        }

        [TestMethod]
        public void ChecklistTextGroupsByStage()
        {
            var text = OASReference.ChecklistText(Bushwalking3().Take(2), "Unit night");
            var lines = text.Split('\n');

            Assert.AreEqual("Unit night", lines[0]);
            Assert.AreEqual("Bushwalking Stage 3", lines[2]);
            Assert.IsTrue(lines[3].StartsWith("☐ I "));
            Assert.AreEqual(5, lines.Length);
        }
    }
}
