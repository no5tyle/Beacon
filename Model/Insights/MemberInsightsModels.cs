namespace Topo.Model.Insights
{
    public class MemberInsightsReport
    {
        public SectionRules Rules { get; set; } = new SectionRules();
        public DateTime? MoveUpDate { get; set; }
        public double? MonthsToMoveUp { get; set; }
        public List<string> Highlights { get; set; } = new List<string>();
        public List<PriorityTask> PeakAwardTasks { get; set; } = new List<PriorityTask>();
        public List<PeakAwardComponent> PeakAwardBreakdown { get; set; } = new List<PeakAwardComponent>();
        public double PeakAwardPercent => PeakAwardBreakdown.Sum(c => c.Earned);
        public MilestoneProgress? Milestone { get; set; }
        public List<StageProgress> Stages { get; set; } = new List<StageProgress>();
        public List<MemberThemeGap> Themes { get; set; } = new List<MemberThemeGap>();
        public List<ActivitySuggestion> CloseToComplete { get; set; } = new List<ActivitySuggestion>();
    }

    public class ChallengeAreaNeed
    {
        public string ChallengeArea { get; set; } = string.Empty;
        public int Have { get; set; }
        public int Need { get; set; }
        public int Remaining => Math.Max(Need - Have, 0);
    }

    public class MilestoneProgress
    {
        public int Number { get; set; }
        public List<ChallengeAreaNeed> Participates { get; set; } = new List<ChallengeAreaNeed>();
        public ChallengeAreaNeed LeadAssist { get; set; } = new ChallengeAreaNeed { ChallengeArea = "Lead / Assist" };
        public int Remaining => Participates.Sum(p => p.Remaining) + LeadAssist.Remaining;
        public int Total => Participates.Sum(p => p.Need) + LeadAssist.Need;
        public bool IsClose { get; set; }
    }

    public class StageProgress
    {
        public string Stream { get; set; } = string.Empty;
        public string StreamDisplay { get; set; } = string.Empty;
        public int Stage { get; set; }
        public bool Started { get; set; }
        public int Done { get; set; }
        public int Total { get; set; }
        public List<RemainingRequirement> Remaining { get; set; } = new List<RemainingRequirement>();
        public bool IsClose { get; set; }
        public double PercentDone => Total == 0 ? 0 : (double)Done / Total;
    }

    public class RemainingRequirement
    {
        public string InputGroup { get; set; } = string.Empty;
        public string InputLabel { get; set; } = string.Empty;
        public string Theme { get; set; } = string.Empty;
        public bool UnitNightSuitable { get; set; }
    }

    public class MemberThemeGap
    {
        public string Theme { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int Count { get; set; }
        public List<string> Stages { get; set; } = new List<string>();
        public bool UnitNightSuitable { get; set; }
    }

    public class ActivityStep
    {
        public string Phase { get; set; } = string.Empty;
        public List<string> Items { get; set; } = new List<string>();
    }

    public class ActivitySuggestion
    {
        public string Kind { get; set; } = string.Empty;
        public string Target { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Summary { get; set; } = string.Empty;
        public bool CoversAll { get; set; }
        public List<ActivityStep> Steps { get; set; } = new List<ActivityStep>();
        public List<string> Notes { get; set; } = new List<string>();
    }
}
