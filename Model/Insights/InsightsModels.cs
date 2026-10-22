namespace Topo.Model.Insights
{
    // Inputs

    public class YouthRecord
    {
        public string MemberId { get; set; } = string.Empty;
        public string MemberName { get; set; } = string.Empty;
        public string Patrol { get; set; } = string.Empty;
        public DateTime? DateOfBirth { get; set; }
        public Wallchart.WallchartItemModel Progress { get; set; } = new Wallchart.WallchartItemModel();
    }

    // One OAS requirement for one member, flattened from the OAS worksheet answers
    public class OASRequirementStatus
    {
        public string Stream { get; set; } = string.Empty;
        public int Stage { get; set; }
        public string InputGroup { get; set; } = string.Empty;
        public string InputLabel { get; set; } = string.Empty;
        public string MemberId { get; set; } = string.Empty;
        public bool Answered { get; set; }
    }

    // Outputs

    public class InsightsReport
    {
        public DateTime GeneratedOn { get; set; }
        public string Section { get; set; } = string.Empty;
        public SectionRules Rules { get; set; } = new SectionRules();
        public int YouthCount { get; set; }
        // Lowest OAS stage shown; lower stages are left out of the report
        public int MinimumStage { get; set; } = 1;
        public Dictionary<string, string> MemberNames { get; set; } = new Dictionary<string, string>();
        public List<StreamCoverage> StreamCoverage { get; set; } = new List<StreamCoverage>();
        public List<StageDemand> NextStageDemand { get; set; } = new List<StageDemand>();
        public List<RequirementGap> RequirementGaps { get; set; } = new List<RequirementGap>();
        public List<MoveUpCandidate> MoveUpCandidates { get; set; } = new List<MoveUpCandidate>();
        public List<TaskSummary> PriorityTaskBoard { get; set; } = new List<TaskSummary>();
        public List<ChallengeAreaDeficit> ChallengeAreaDeficits { get; set; } = new List<ChallengeAreaDeficit>();
        public List<SkillTheme> SkillThemes { get; set; } = new List<SkillTheme>();
        public List<NightSuggestion> SuggestedNights { get; set; } = new List<NightSuggestion>();
    }

    public class StreamCoverage
    {
        public string Stream { get; set; } = string.Empty;
        public string StreamDisplay { get; set; } = string.Empty;
        public bool IsCore { get; set; }
        public int NotStarted { get; set; }
        public double AverageStage { get; set; }
        public int HighestStage { get; set; }
        // Index = stage (1..9), value = number of youth who have reached at least that stage
        public int[] ReachedStage { get; set; } = new int[10];
        // Index = stage (1..9), value = youth whose lowest incomplete stage in the stream is that stage
        public List<string>[] NextStageMemberIds { get; set; } = Enumerable.Range(0, 10).Select(_ => new List<string>()).ToArray();
        // Index = stage (1..9), value = youth who have started that stage in Terrain
        public HashSet<string>[] WorkingOnMemberIds { get; set; } = Enumerable.Range(0, 10).Select(_ => new HashSet<string>()).ToArray();
    }

    public class StageDemand
    {
        public string Stream { get; set; } = string.Empty;
        public string StreamDisplay { get; set; } = string.Empty;
        public int Stage { get; set; }
        public List<string> MemberIds { get; set; } = new List<string>();
        public int PriorityMemberCount { get; set; }
        public int Count => MemberIds.Count;
    }

    public class RequirementGap
    {
        public string Stream { get; set; } = string.Empty;
        public string StreamDisplay { get; set; } = string.Empty;
        public int Stage { get; set; }
        public string InputGroup { get; set; } = string.Empty;
        public string InputLabel { get; set; } = string.Empty;
        public string Theme { get; set; } = string.Empty;
        public bool UnitNightSuitable { get; set; }
        // All eligible youth: those who have completed the stage, plus those who haven't and could get
        // credit for it. Only the second group can be outstanding.
        public List<string> OutstandingMemberIds { get; set; } = new List<string>();
        public int CandidateCount { get; set; }
        public int CompletedCount { get; set; }
        // Youth who have started this stage in Terrain
        public List<string> ActiveOutstandingMemberIds { get; set; } = new List<string>();
        public int ActiveCandidateCount { get; set; }
        public int PriorityMemberCount { get; set; }
        public int OutstandingCount => OutstandingMemberIds.Count;
        public int ActiveOutstandingCount => ActiveOutstandingMemberIds.Count;
        public double OutstandingPercent => CandidateCount == 0 ? 0 : (double)OutstandingCount / CandidateCount;
        public double ActiveOutstandingPercent => ActiveCandidateCount == 0 ? 0 : (double)ActiveOutstandingCount / ActiveCandidateCount;
    }

    public enum Urgency
    {
        High,
        Medium,
        Low
    }

    public enum TaskCategory
    {
        Introduction,
        Milestone,
        OAS,
        SIA,
        PeakAward
    }

    public class MoveUpCandidate
    {
        public string MemberId { get; set; } = string.Empty;
        public string MemberName { get; set; } = string.Empty;
        public string Patrol { get; set; } = string.Empty;
        public string AgeDisplay { get; set; } = string.Empty;
        public DateTime MoveUpDate { get; set; }
        public double MonthsRemaining { get; set; }
        public Urgency Urgency { get; set; }
        public double PriorityScore { get; set; }
        public List<PriorityTask> Tasks { get; set; } = new List<PriorityTask>();
        public int OutstandingCount => Tasks.Count(t => !t.Done);
        public double CompletionPercent => Tasks.Count == 0 ? 1 : (double)Tasks.Count(t => t.Done) / Tasks.Count;
    }

    public class PriorityTask
    {
        public TaskCategory Category { get; set; }
        // Stable key used to group the same task across youth, e.g. "peak:aj"
        public string Key { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Detail { get; set; } = string.Empty;
        public bool Done { get; set; }
        public bool UnitNightSuitable { get; set; }
    }

    public class TaskSummary
    {
        public string Key { get; set; } = string.Empty;
        public TaskCategory Category { get; set; }
        public string Title { get; set; } = string.Empty;
        public bool UnitNightSuitable { get; set; }
        public List<string> MemberNames { get; set; } = new List<string>();
        public int HighUrgencyCount { get; set; }
    }

    public class ChallengeAreaDeficit
    {
        public string ChallengeArea { get; set; } = string.Empty;
        public int ParticipatesShort { get; set; }
        public int YouthShort { get; set; }
    }

    public class SkillTheme
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int OutstandingRequirements { get; set; }
        public List<string> MemberIds { get; set; } = new List<string>();
        public List<string> ActiveMemberIds { get; set; } = new List<string>();
        public int PriorityMemberCount { get; set; }
        public List<RequirementGap> Requirements { get; set; } = new List<RequirementGap>();
        public double Score => MemberIds.Count + 2 * ActiveMemberIds.Count + 2 * PriorityMemberCount + 0.25 * OutstandingRequirements;
    }

    public class NightSuggestion
    {
        public int Number { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Focus { get; set; } = string.Empty;
        public string ChallengeArea { get; set; } = string.Empty;
        public List<string> Covers { get; set; } = new List<string>();
        public List<string> MemberNames { get; set; } = new List<string>();
        public int PriorityMemberCount { get; set; }
    }
}
