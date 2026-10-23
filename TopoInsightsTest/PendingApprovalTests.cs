using Topo.Model.Approvals;

namespace TopoInsightsTest
{
    [TestClass]
    public class PendingApprovalTests
    {
        private static Result Submission(string id, string status, DateTime date, string type = "outdoor_adventure_skill", Achievement_Meta? meta = null, params (string Name, string Outcome)[] votes)
        {
            return new Result
            {
                achievement = new Achievement { id = "ach-" + id, type = type, achievement_meta = meta ?? new Achievement_Meta { stream = "bushwalking", branch = "bushwalking", stage = 3 } },
                submission = new Submission
                {
                    id = id,
                    type = "review",
                    status = status,
                    date = date,
                    actioned_by = votes.Select(v => new Actioned_By { member_first_name = v.Name, member_last_name = "Leader", outcome = v.Outcome }).ToArray()
                },
                member = new Member { id = "m-" + id, first_name = "Ava", last_name = "Nguyen" },
                unit_permissions = new Unit_Permissions { write = true }
            };
        }

        [TestMethod]
        public void OnlyPendingSubmissionsOldestFirst()
        {
            var pending = PendingApproval.FromResults(new[]
            {
                Submission("new", "pending", new DateTime(2026, 10, 20)),
                Submission("done", "finalised", new DateTime(2026, 9, 1)),
                Submission("old", "pending", new DateTime(2026, 10, 1)),
            });

            CollectionAssert.AreEqual(new[] { "old", "new" }, pending.Select(p => p.SubmissionId).ToArray());
        }

        [TestMethod]
        public void NamesAndVotes()
        {
            var approval = PendingApproval.FromResults(new[]
            {
                Submission("s1", "pending", DateTime.Today, votes: new[] { ("Pat", "approved"), ("Sam", "rejected") })
            }).Single();

            Assert.AreEqual("OAS Bushwalking 3", approval.AchievementName);
            Assert.AreEqual("Ava Nguyen", approval.MemberName);
            Assert.AreEqual("Review", approval.SubmissionType);
            CollectionAssert.AreEqual(new[] { "Pat Leader" }, approval.ApprovedBy);
            CollectionAssert.AreEqual(new[] { "Sam Leader" }, approval.ImproveBy);
            Assert.IsTrue(approval.CanAction);
        }

        [TestMethod]
        public void AchievementNamesForEachType()
        {
            Assert.AreEqual("Milestone 2", PendingApproval.AchievementDisplayName(new Achievement { type = "milestone", achievement_meta = new Achievement_Meta { stage = 2 } }));
            Assert.AreEqual("Sia Adventure Sport", PendingApproval.AchievementDisplayName(new Achievement { type = "special_interest_area", achievement_meta = new Achievement_Meta { sia_area = "sia_adventure_sport" } }));
            Assert.AreEqual("OAS Aquatics Snorkelling 2", PendingApproval.AchievementDisplayName(new Achievement { type = "outdoor_adventure_skill", achievement_meta = new Achievement_Meta { stream = "aquatics", branch = "snorkelling", stage = 2 } }));
            Assert.AreEqual("Intro To Section", PendingApproval.AchievementDisplayName(new Achievement { type = "intro_section" }));
            Assert.AreEqual("Peak Award", PendingApproval.AchievementDisplayName(new Achievement { type = "peak_award" }));
        }
    }
}
