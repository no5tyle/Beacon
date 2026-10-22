namespace Topo.Model.Insights
{
    public class InsightsSettings
    {
        // Youth whose move-up date falls inside this window are treated as "moving up soon"
        public int MoveUpWindowMonths { get; set; } = 6;
        // How many of the most in-demand OAS stages to pull requirement level detail for
        public int MaxGapStages { get; set; } = 8;
        public int SuggestedNights { get; set; } = 6;
        // Insights cover the core OAS streams only (bushcraft, bushwalking, camping) unless asked for.
        // Peak award stage progression counts always include every stream.
        public bool IncludeNonCoreOAS { get; set; }
        // Only show the OAS stages the section typically works on, e.g. Stages 2 and 3 for Cubs
        public bool SectionStagesOnly { get; set; } = true;
        public List<SectionRules> Sections { get; set; } = SectionRules.Defaults();

        public int MinimumStage(string section)
        {
            return SectionStagesOnly ? Math.Max(1, RulesFor(section).LowestStageShown) : 1;
        }

        public int MaximumStage(string section)
        {
            return SectionStagesOnly ? Math.Clamp(RulesFor(section).HighestStageShown, MinimumStage(section), 9) : 9;
        }

        public SectionRules RulesFor(string section)
        {
            return Sections.FirstOrDefault(s => s.Section == section)
                ?? new SectionRules { Section = section, MoveUpAgeYears = 99 };
        }
    }

    public class SectionRules
    {
        public string Section { get; set; } = string.Empty;
        public string SectionDisplay { get; set; } = string.Empty;
        public string PeakAwardName { get; set; } = "Peak Award";
        // Age the youth is expected to link to the next section (or age out)
        public double MoveUpAgeYears { get; set; }
        public int OASStageProgressionsRequired { get; set; }
        // Lowest stage the youth must have reached in each core stream (Bushcraft, Bushwalking, Camping)
        public int CoreStageRequired { get; set; }
        // Venturers and Rovers: this many of the section's progressions must be at OASHighStage or above
        public int OASHighStageProgressionsRequired { get; set; }
        public int OASHighStage { get; set; }
        public int SIAProjectsRequired { get; set; }
        // OAS stages insights show when limited to the section's usual stages
        public int LowestStageShown { get; set; } = 1;
        public int HighestStageShown { get; set; } = 9;

        // OAS requirements follow the peak award wording in Terrain. SIA and move up age defaults are
        // a starting point only and are editable on the Insights page.
        public static List<SectionRules> Defaults()
        {
            return new List<SectionRules>
            {
                new SectionRules { Section = "joey", SectionDisplay = "Joey Scouts", PeakAwardName = "Joey Scout Award", MoveUpAgeYears = 8, OASStageProgressionsRequired = 0, CoreStageRequired = 1, SIAProjectsRequired = 1, LowestStageShown = 1, HighestStageShown = 1 },
                new SectionRules { Section = "cub", SectionDisplay = "Cub Scouts", PeakAwardName = "Grey Wolf Award", MoveUpAgeYears = 11, OASStageProgressionsRequired = 8, CoreStageRequired = 3, SIAProjectsRequired = 2, LowestStageShown = 2, HighestStageShown = 3 },
                new SectionRules { Section = "scout", SectionDisplay = "Scouts", PeakAwardName = "Australian Scout Medallion", MoveUpAgeYears = 15, OASStageProgressionsRequired = 10, CoreStageRequired = 5, SIAProjectsRequired = 4, LowestStageShown = 4, HighestStageShown = 5 },
                new SectionRules { Section = "venturer", SectionDisplay = "Venturer Scouts", PeakAwardName = "Queen's Scout Award", MoveUpAgeYears = 18, OASStageProgressionsRequired = 12, CoreStageRequired = 5, OASHighStageProgressionsRequired = 4, OASHighStage = 4, SIAProjectsRequired = 6, LowestStageShown = 5, HighestStageShown = 7 },
                new SectionRules { Section = "rover", SectionDisplay = "Rover Scouts", PeakAwardName = "Baden-Powell Scout Award", MoveUpAgeYears = 26, OASStageProgressionsRequired = 14, CoreStageRequired = 5, OASHighStageProgressionsRequired = 6, OASHighStage = 4, SIAProjectsRequired = 8, LowestStageShown = 5, HighestStageShown = 9 },
            };
        }
    }
}
