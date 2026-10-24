using Topo.Model.OAS;

namespace TopoInsightsTest
{
    [TestClass]
    public class OASSignOffTests
    {
        private static readonly string[] Selected = { "plan_a", "do_b" };

        private static Result Record(string memberId, string status, DateTime lastUpdated, params string[] done)
        {
            return new Result
            {
                member_id = memberId,
                status = status,
                last_updated = lastUpdated,
                achievement_meta = new Achievement_Meta { stream = "bushwalking", branch = "bushwalking", stage = 2 },
                answers = done.ToDictionary(id => id, id => "True")
            };
        }

        [TestMethod]
        public void ReadyToSubmitNeedsEveryStatementOnAnOpenStage()
        {
            var all = new[] { "plan_a", "do_b", "logbook_up_to_date" };

            Assert.IsTrue(OASSignOff.ReadyToSubmit(Record("y1", "in_progress", DateTime.Today, all), all));
            Assert.IsFalse(OASSignOff.ReadyToSubmit(Record("y1", "in_progress", DateTime.Today, "plan_a", "do_b"), all));
            Assert.IsFalse(OASSignOff.ReadyToSubmit(Record("y1", "awarded", DateTime.Today, all), all));
            Assert.IsFalse(OASSignOff.ReadyToSubmit(null, all));
        }

        [TestMethod]
        public void NotStartedNeedsEverything()
        {
            var state = OASSignOff.ForYouth(null, Selected);

            Assert.AreEqual(SignOffState.ToAdd, state.State);
            Assert.AreEqual(2, state.ToAddCount);
        }

        [TestMethod]
        public void InProgressNeedsOnlyWhatIsMissing()
        {
            var state = OASSignOff.ForYouth(Record("y1", "in_progress", DateTime.Today, "plan_a"), Selected);

            Assert.AreEqual(SignOffState.ToAdd, state.State);
            Assert.AreEqual(1, state.ToAddCount);
        }

        [TestMethod]
        public void HavingEverythingAlreadyIsDone()
        {
            var state = OASSignOff.ForYouth(Record("y1", "feedback_review", DateTime.Today, "plan_a", "do_b"), Selected);

            Assert.AreEqual(SignOffState.AlreadyDone, state.State);
        }

        [TestMethod]
        public void SubmittedOrAwardedStagesAreLocked()
        {
            foreach (var status in new[] { "pending_review", "pending_approval", "approved", "awarded" })
            {
                var state = OASSignOff.ForYouth(Record("y1", status, DateTime.Today), Selected);
                Assert.AreEqual(SignOffState.Locked, state.State, status);
                Assert.AreEqual(status, state.Status);
            }
        }

        [TestMethod]
        public void LatestPrefersCompletedThenNewestAndMatchesBranch()
        {
            var records = new[]
            {
                Record("y1", "in_progress", new DateTime(2026, 10, 1)),
                Record("y1", "awarded", new DateTime(2025, 1, 1)),
                Record("y2", "in_progress", new DateTime(2026, 1, 1)),
                Record("y2", "draft_review", new DateTime(2026, 9, 1)),
            };
            var other = Record("y3", "in_progress", DateTime.Today);
            other.achievement_meta.branch = "other_branch";

            var latest = OASSignOff.LatestByMember(records.Append(other), "bushwalking");

            Assert.AreEqual("awarded", latest["y1"].status);
            Assert.AreEqual("draft_review", latest["y2"].status);
            Assert.IsFalse(latest.ContainsKey("y3"));
        }
    }
}
