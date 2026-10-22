using System.Text;

namespace Topo.Model.Insights
{
    // Builds a prompt a leader can paste into an AI chat tool to plan one high value, OAS focused unit night.
    // Uses unit level counts only: no youth names or other identifiers are included, and any youth
    // named in the leader notes is reduced to initials.
    public static class NightPromptBuilder
    {
        private const int MaxThemes = 5;
        private const int MaxRequirementsPerTheme = 6;

        public static string Build(InsightsReport report, string sectionDisplay, DateTime today, bool includesNonCoreOAS, int nightMinutes, string leaderNotes = "")
        {
            var section = string.IsNullOrWhiteSpace(sectionDisplay) ? "unit" : $"{sectionDisplay} unit";
            var minutes = nightMinutes > 0 ? nightMinutes : 90;
            var streams = includesNonCoreOAS ? "OAS" : "core OAS (Bushcraft, Bushwalking, Camping)";
            leaderNotes = PromptPrivacy.ScrubNames(leaderNotes, report.MemberNames.Values);
            var sb = new StringBuilder();

            sb.AppendLine($"I'm a Scouts Australia leader. Help me plan one {minutes} minute unit night for my {section} that ticks off as many outstanding {streams} requirements as possible. It doesn't need to cover everything, just one high value night. The facts below come from Terrain via Topo.");
            sb.AppendLine();

            sb.AppendLine("## The unit");
            sb.AppendLine($"- Date: {today:d MMMM yyyy}");
            sb.AppendLine($"- Youth members: {report.YouthCount}");
            var movingUp = report.MoveUpCandidates.Count(c => c.IsMovingUp);
            var focus = report.MoveUpCandidates.Count(c => !c.IsMovingUp);
            if (movingUp > 0 || focus > 0)
                sb.AppendLine($"- {report.MoveUpCandidates.Count} priority youth: {movingUp} moving up to the next section within the next few months{(focus > 0 ? $" and {focus} the leaders want to focus on" : "")}. Requirements they still need matter most.");
            var demand = report.NextStageDemand.Take(6).ToList();
            if (demand.Any())
                sb.AppendLine($"- Most common next stages: {string.Join(", ", demand.Select(d => $"{d.StreamDisplay} {d.Stage} ({d.Count} youth)"))}");
            sb.AppendLine();

            // Only requirements that can be done at a regular meeting
            var themes = report.SkillThemes
                .Where(t => t.Name != SkillThemeClassifier.OtherTheme)
                .Take(MaxThemes)
                .ToList();
            sb.AppendLine("## Outstanding requirements that suit a unit night, grouped by skill");
            if (themes.Any())
            {
                foreach (var theme in themes)
                {
                    var priority = theme.PriorityMemberCount > 0 ? $", {theme.PriorityMemberCount} priority" : "";
                    sb.AppendLine($"{theme.Name} ({theme.ActiveMemberIds.Count} youth working on these stages still need them, {theme.MemberIds.Count} eligible youth in total still need them{priority}):");
                    foreach (var requirement in theme.Requirements.Take(MaxRequirementsPerTheme))
                    {
                        var priorityNote = requirement.PriorityMemberCount > 0 ? $", {requirement.PriorityMemberCount} priority" : "";
                        sb.AppendLine($"- {requirement.StreamDisplay} Stage {requirement.Stage} [{requirement.InputGroup}] {requirement.InputLabel} (still needed by {requirement.ActiveOutstandingCount} youth working on this stage and {requirement.OutstandingCount} of {requirement.CandidateCount} eligible youth, {requirement.CompletedCount} have completed the stage{priorityNote})");
                    }
                }
            }
            else
            {
                sb.AppendLine("No requirement detail was found.");
            }
            sb.AppendLine();

            var areas = report.ChallengeAreaDeficits.Where(d => d.ParticipatesShort > 0).ToList();
            if (areas.Any())
            {
                sb.AppendLine("## Milestone balance");
                foreach (var area in areas)
                    sb.AppendLine($"- {area.ChallengeArea}: {area.YouthShort} youth short, {area.ParticipatesShort} credits in total");
                sb.AppendLine();
            }

            if (!string.IsNullOrWhiteSpace(leaderNotes))
            {
                sb.AppendLine("## Leader notes");
                sb.AppendLine(leaderNotes.Trim());
                sb.AppendLine();
            }

            sb.AppendLine("## How to plan");
            sb.AppendLine("- Use only the requirements listed above. Don't invent, reword or change Scouts Australia requirements.");
            sb.AppendLine("- Youth can work on several OAS stages at once. \"Working on this stage\" means they've started it in Terrain; \"eligible\" means they've completed the stage or could get credit for it.");
            sb.AppendLine("- Pick a focus that helps the most youth, favouring requirements needed by youth already working on that stage and priority youth. One or two skill themes is better than trying to cover everything.");
            sb.AppendLine("- Youth are on different stages, so give each activity a way for different stages to take part (for example older Scouts teaching or running a base for younger ones where a requirement asks for that).");
            sb.AppendLine("- Use the patrol system and keep it youth-led where possible, following Plan > Do > Review.");
            sb.AppendLine("- It must run at a normal meeting place in the time given, with gear a typical unit has or can easily get. No outings.");
            sb.AppendLine("- In Terrain the night is logged under one challenge area and each youth gets one credit (participate, assist or lead).");
            sb.AppendLine();

            sb.AppendLine("## What I'd like back");
            sb.AppendLine("1. A title and a one or two sentence aim for the night.");
            sb.AppendLine("2. A timed run sheet that adds up to the night length, including opening, activities, a short review and closing.");
            sb.AppendLine("3. For each activity: how it runs, which listed requirements (stream, stage and wording) it lets leaders verify, and what to look for when verifying.");
            sb.AppendLine("4. A gear list and any safety notes.");
            sb.AppendLine("5. The challenge area to log it under, and which youth roles could be lead or assist.");

            return sb.ToString();
        }
    }
}
