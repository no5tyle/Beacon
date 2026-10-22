using System.ComponentModel.DataAnnotations;

namespace Topo.Model.Insights
{
    public enum InsightsTab
    {
        OASGaps,
        MovingUp,
        Programme
    }

    public class InsightsPageViewModel
    {
        public Dictionary<string, string> Units { get; set; } = new Dictionary<string, string>();

        [Required(ErrorMessage = "Select unit")]
        public string UnitId { get; set; } = string.Empty;
        public string UnitName { get; set; } = string.Empty;
        public string GroupName { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public bool SuppressLastName { get; set; }
        public bool ShowSettings { get; set; }
        public InsightsTab SelectedTab { get; set; } = InsightsTab.OASGaps;
        public InsightsSettings Settings { get; set; } = new InsightsSettings();
        public SectionRules SectionRules { get; set; } = new SectionRules();
        public InsightsReport? Report { get; set; }
        public HashSet<string> ExpandedThemes { get; set; } = new HashSet<string>();
        public HashSet<string> ExpandedStreams { get; set; } = new HashSet<string>();
    }
}
