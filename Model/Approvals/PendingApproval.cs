using System.Globalization;

namespace Topo.Model.Approvals
{
    // A submission waiting for the Unit Council, as Terrain's Approvals tab shows it
    public class PendingApproval
    {
        public string SubmissionId { get; set; } = string.Empty;
        public string AchievementId { get; set; } = string.Empty;
        public string AchievementType { get; set; } = string.Empty;
        public string AchievementName { get; set; } = string.Empty;
        public string MemberId { get; set; } = string.Empty;
        public string MemberName { get; set; } = string.Empty;
        // "Review" (Unit Council sign off) or "Award"
        public string SubmissionType { get; set; } = string.Empty;
        public DateTime SubmittedOn { get; set; }
        public List<string> ApprovedBy { get; set; } = new List<string>();
        public List<string> ImproveBy { get; set; } = new List<string>();
        // Terrain says whether this leader may action it
        public bool CanAction { get; set; }

        // Terrain needs this many Unit Council members to agree before anything happens
        public const int VotesNeeded = 2;

        public static List<PendingApproval> FromResults(IEnumerable<Result> results)
        {
            return results
                .Where(r => r.submission.status == "pending")
                .Select(r => new PendingApproval
                {
                    SubmissionId = r.submission.id,
                    AchievementId = r.achievement.id,
                    AchievementType = r.achievement.type,
                    AchievementName = AchievementDisplayName(r.achievement),
                    MemberId = r.member.id,
                    MemberName = $"{r.member.first_name} {r.member.last_name}".Trim(),
                    SubmissionType = TitleCase(r.submission.type),
                    SubmittedOn = r.submission.date,
                    ApprovedBy = Voters(r, "approved"),
                    ImproveBy = Voters(r, "rejected", "improve", "feedback"),
                    CanAction = r.unit_permissions.write
                })
                .OrderBy(a => a.SubmittedOn)
                .ToList();
        }

        // Same wording as the rest of Beacon, e.g. "OAS Bushwalking 3", "Milestone 2", "Intro To Section"
        public static string AchievementDisplayName(Achievement achievement)
        {
            var meta = achievement.achievement_meta;
            var name = achievement.type switch
            {
                "special_interest_area" => (string.IsNullOrEmpty(meta?.sia_area) ? "special_interest_area" : meta.sia_area).Replace("_", " "),
                "milestone" => $"milestone {meta?.stage}",
                "outdoor_adventure_skill" => meta?.stream == meta?.branch
                    ? $"OAS {meta?.stream} {meta?.stage}"
                    : $"OAS {meta?.stream} {meta?.branch} {meta?.stage}",
                "intro_section" => "intro to section",
                "intro_scouting" => "intro to scouting",
                _ => achievement.type.Replace("_", " ")
            };
            return TitleCase(name);
        }

        private static List<string> Voters(Result result, params string[] outcomes)
        {
            return result.submission.actioned_by
                .Where(a => outcomes.Contains(a.outcome))
                .Select(a => $"{a.member_first_name} {a.member_last_name}".Trim())
                .ToList();
        }

        private static string TitleCase(string text)
        {
            return new CultureInfo("en-AU", false).TextInfo.ToTitleCase(text ?? "");
        }
    }
}
