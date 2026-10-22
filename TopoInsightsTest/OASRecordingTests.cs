using System.Text.Json.Nodes;
using Newtonsoft.Json;
using Topo.Model.OAS;

namespace TopoInsightsTest
{
    [TestClass]
    public class OASRecordingTests
    {
        private const string FirstStatement = "their_help_stage_1_pack_bushwalk_scout_backpack_ed01f4";
        private const string SecondStatement = "area_bushwalking_forecast_will_weather_latest_where_8f2cdd";
        private static readonly OASVerifier Verifier = new OASVerifier { Name = "Pat Leader", Contact = "pat@example.com" };
        private static readonly DateTime Today = new DateTime(2026, 10, 22);

        private static GetOASTemplateResultModel Template()
        {
            var json = File.ReadAllText(Path.Combine("ReportData", "oas-bushwalking-3-template.json"));
            return JsonConvert.DeserializeObject<GetOASTemplateResultModel>(json)!;
        }

        private static JsonObject ExistingAchievement()
        {
            return JsonNode.Parse($$"""
            {
              "id": "ach-1",
              "member_id": "youth-1",
              "template": "oas/bushwalking/3",
              "version": 2,
              "section": "scout",
              "status": "in_progress",
              "last_updated": "2026-10-01T10:00:00.000Z",
              "achievement_meta": { "stream": "bushwalking", "branch": "bushwalking", "stage": 3 },
              "answers": {
                "{{FirstStatement}}": true,
                "{{FirstStatement}}_verifierName": "Alex Leader",
                "{{FirstStatement}}_verifiedDate": "01/10/2026",
                "file_uploader": []
              },
              "uploads": [ { "bucket": "b", "filename": "map.jpg", "key": "k", "uploaded_on": "2026-10-01" } ]
            }
            """)!.AsObject();
        }

        [TestMethod]
        public void StatementsComeFromTemplateWithExistingAnswers()
        {
            var statements = OASRecording.Statements(Template(), ExistingAchievement()["answers"] as JsonObject);

            Assert.AreEqual(18, statements.Count, "17 verifiable statements plus the logbook check");
            Assert.IsFalse(statements.Any(s => s.InputId == "file_uploader"));
            var first = statements.Single(s => s.InputId == FirstStatement);
            Assert.IsTrue(first.AlreadyDone);
            Assert.AreEqual("Alex Leader", first.VerifiedBy);
            Assert.AreEqual("Plan", first.Group);
            Assert.IsTrue(statements.Single(s => s.InputId == OASRecording.LogbookInputId).IsLogbook);
            Assert.IsFalse(OASRecording.AllComplete(statements));
        }

        [TestMethod]
        public void StringTrueAnswersCountAsDone()
        {
            var answers = new JsonObject { [SecondStatement] = "true" };

            var statements = OASRecording.Statements(Template(), answers);

            Assert.IsTrue(statements.Single(s => s.InputId == SecondStatement).AlreadyDone);
        }

        [TestMethod]
        public void AddVerificationsKeepsExistingAnswersAndAddsVerifierDetails()
        {
            var existing = ExistingAchievement();
            var statements = OASRecording.Statements(Template(), existing["answers"] as JsonObject);
            var ticked = statements.Where(s => s.InputId == SecondStatement || s.InputId == FirstStatement || s.IsLogbook).ToList();

            var answers = OASRecording.AddVerifications(existing["answers"] as JsonObject, ticked, Verifier, Today);

            // Existing verification untouched
            Assert.AreEqual("Alex Leader", answers[FirstStatement + "_verifierName"]!.ToString());
            Assert.AreEqual("01/10/2026", answers[FirstStatement + "_verifiedDate"]!.ToString());
            Assert.IsNotNull(answers["file_uploader"]);
            // New verification in Terrain's format
            Assert.AreEqual(true, answers[SecondStatement]!.GetValue<bool>());
            Assert.AreEqual("member", answers[SecondStatement + "_verifierType"]!.ToString());
            Assert.AreEqual("Pat Leader", answers[SecondStatement + "_verifierName"]!.ToString());
            Assert.AreEqual("pat@example.com", answers[SecondStatement + "_verifierContact"]!.ToString());
            Assert.AreEqual("22/10/2026", answers[SecondStatement + "_verifiedDate"]!.ToString());
            // Logbook is a plain checkbox
            Assert.AreEqual(true, answers[OASRecording.LogbookInputId]!.GetValue<bool>());
            Assert.IsNull(answers[OASRecording.LogbookInputId + "_verifierName"]);
            // The original object isn't modified
            Assert.IsNull(existing["answers"]![SecondStatement]);
        }

        [TestMethod]
        public void UpdateBodyKeepsRecordFields()
        {
            var existing = ExistingAchievement();
            var answers = OASRecording.AddVerifications(existing["answers"] as JsonObject, new List<OASStatement>(), Verifier, Today);

            var body = OASRecording.UpdateBody(existing, answers);

            Assert.AreEqual("outdoor_adventure_skill", body["achievement_type"]!.ToString());
            Assert.AreEqual("oas/bushwalking/3", body["template"]!.ToString());
            Assert.AreEqual(2, body["version"]!.GetValue<int>());
            Assert.AreEqual("scout", body["section"]!.ToString());
            Assert.AreEqual("2026-10-01T10:00:00.000Z", body["last_updated"]!.ToString());
            Assert.AreEqual(3, body["achievement_meta"]!["stage"]!.GetValue<int>());
            Assert.AreEqual("map.jpg", body["uploads"]![0]!["filename"]!.ToString());
            Assert.IsNull(body["status"], "Status isn't sent; Terrain controls it");
            Assert.IsNull(body["id"]);
        }

        [TestMethod]
        public void CreateBodyMatchesTerrain()
        {
            var stage = new OASStageListModel { Stream = "Bushwalking", Branch = "bushwalking", Stage = 3 };
            var statements = OASRecording.Statements(Template(), null);
            var answers = OASRecording.AddVerifications(null, statements.Take(1).ToList(), Verifier, Today);

            var body = OASRecording.CreateBody(Template(), stage, "scout", answers);

            Assert.AreEqual("bushwalking", body["achievement_meta"]!["stream"]!.ToString());
            Assert.AreEqual("bushwalking", body["achievement_meta"]!["branch"]!.ToString());
            Assert.AreEqual(3, body["achievement_meta"]!["stage"]!.GetValue<int>());
            Assert.AreEqual("oas/bushwalking/3", body["template"]!.ToString());
            Assert.AreEqual(2, body["version"]!.GetValue<int>());
            Assert.AreEqual(0, body["uploads"]!.AsArray().Count);
            Assert.IsNull(body["last_updated"]);
            Assert.AreEqual(true, body["answers"]![FirstStatement]!.GetValue<bool>());
        }

        [TestMethod]
        public void SubmitBodyIsReviewOnBehalf()
        {
            var body = OASRecording.SubmitBody("unit-1", "leader-1");

            Assert.AreEqual("{\"type\":\"review\",\"unit_id\":\"unit-1\",\"submitted_by\":\"leader-1\"}", body.ToJsonString());
        }

        [TestMethod]
        public void StageRules()
        {
            Assert.IsTrue(OASRecording.CanReceiveCredit(3, new int[0]));
            Assert.IsFalse(OASRecording.CanReceiveCredit(4, new[] { 2, 3 }));
            Assert.IsTrue(OASRecording.CanReceiveCredit(4, new[] { 1 }));
            Assert.IsTrue(OASRecording.IsPreviousStageComplete(1, new int[0]));
            Assert.IsFalse(OASRecording.IsPreviousStageComplete(3, new[] { 1 }));
            Assert.IsTrue(OASRecording.IsEditable(""));
            Assert.IsTrue(OASRecording.IsEditable("in_progress"));
            Assert.IsTrue(OASRecording.IsEditable("feedback_review"));
            Assert.IsFalse(OASRecording.IsEditable("pending_review"));
            Assert.IsFalse(OASRecording.IsEditable("awarded"));
        }
    }
}
