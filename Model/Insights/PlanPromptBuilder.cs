using System.Text;

namespace Topo.Model.Insights
{
    // Builds a prompt a leader can paste into an AI chat tool to get a completion plan for one youth.
    // Only initials (or nothing) identify the youth; no names, member number or date of birth are included.
    public static class PlanPromptBuilder
    {
        public const string AnonymousName = "the youth member";

        public static string Build(MemberInsightsReport insights, string firstName, string lastName, bool leaveOutInitials, string sectionDisplay, DateTime today, bool includesNonCoreOAS, string leaderNotes = "")
        {
            var initials = PromptPrivacy.Initials(firstName, lastName);
            var name = leaveOutInitials || initials.Length == 0 ? AnonymousName : initials;
            // Leader notes may mention the youth by name, so swap any mention for the same label
            leaderNotes = PromptPrivacy.ScrubNames(leaderNotes, new[] { $"{firstName} {lastName}" });
            if (name == AnonymousName && initials.Length > 0)
                leaderNotes = leaderNotes.Replace(initials, AnonymousName);
            var heading = name == AnonymousName ? "this youth member" : name;
            var section = string.IsNullOrWhiteSpace(sectionDisplay) ? "their section" : sectionDisplay;
            var peakAward = insights.Rules.PeakAwardName;
            var sb = new StringBuilder();

            sb.AppendLine($"I'm a Scouts Australia leader. Help me plan how {heading} can complete their outstanding achievements before they move up from {section}. The facts below come from Terrain via Topo.");
            sb.AppendLine();

            sb.AppendLine("## Timing");
            sb.AppendLine($"- Today: {today:d MMMM yyyy}");
            if (insights.MoveUpDate.HasValue && insights.MonthsToMoveUp.HasValue)
            {
                var months = insights.MonthsToMoveUp.Value;
                sb.AppendLine(months < 0
                    ? $"- Move-up age was reached around {insights.MoveUpDate:MMMM yyyy}, so treat this as urgent."
                    : $"- Expected to move up around {insights.MoveUpDate:MMMM yyyy}, about {months:0.#} months away.");
            }
            else
            {
                sb.AppendLine("- Move-up date unknown.");
            }
            sb.AppendLine();

            sb.AppendLine($"## {peakAward}");
            var outstanding = insights.PeakAwardTasks.Where(t => !t.Done).ToList();
            var done = insights.PeakAwardTasks.Where(t => t.Done).ToList();
            if (outstanding.Any())
            {
                sb.AppendLine("Outstanding:");
                foreach (var task in outstanding)
                    sb.AppendLine(string.IsNullOrEmpty(task.Detail) ? $"- {task.Title}" : $"- {task.Title} ({task.Detail})");
            }
            else
            {
                sb.AppendLine("All tracked items are complete.");
            }
            if (done.Any())
                sb.AppendLine($"Already complete: {string.Join(", ", done.Select(t => t.Title))}");
            sb.AppendLine();

            if (insights.Milestone != null)
            {
                sb.AppendLine($"## Milestone {insights.Milestone.Number} progress");
                foreach (var need in insights.Milestone.Participates)
                    sb.AppendLine($"- {need.ChallengeArea} participates: {Math.Min(need.Have, need.Need)} of {need.Need}");
                sb.AppendLine($"- Lead or assist: {Math.Min(insights.Milestone.LeadAssist.Have, insights.Milestone.LeadAssist.Need)} of {insights.Milestone.LeadAssist.Need}");
                sb.AppendLine();
            }

            var streams = includesNonCoreOAS ? "OAS" : "Core OAS (Bushcraft, Bushwalking, Camping)";
            sb.AppendLine($"## {streams} requirements still to do");
            if (insights.Stages.Any())
            {
                foreach (var stage in insights.Stages)
                {
                    var status = stage.Started ? $"started, {stage.Done} of {stage.Total} done" : "not started";
                    sb.AppendLine($"{stage.StreamDisplay} Stage {stage.Stage} ({status}):");
                    foreach (var requirement in stage.Remaining)
                    {
                        var where = requirement.UnitNightSuitable ? "unit night" : "needs an outing";
                        sb.AppendLine($"- [{requirement.InputGroup}] {requirement.InputLabel} ({where})");
                    }
                }
            }
            else
            {
                sb.AppendLine("None found.");
            }
            sb.AppendLine();

            if (insights.CloseToComplete.Any())
            {
                sb.AppendLine("## Close to completing");
                foreach (var activity in insights.CloseToComplete)
                    sb.AppendLine($"- {activity.Target}: {activity.Summary}");
                sb.AppendLine();
            }

            if (!string.IsNullOrWhiteSpace(leaderNotes))
            {
                sb.AppendLine("## Leader notes");
                sb.AppendLine(leaderNotes.Trim());
                sb.AppendLine();
            }

            sb.AppendLine("## How to plan");
            sb.AppendLine("- Use only the requirements listed above. Don't invent, reword or change Scouts Australia requirements; if something looks missing, say so rather than guessing.");
            sb.AppendLine("- In Terrain each activity is logged under one challenge area and gives one credit (participate, assist or lead), so separate milestone credits need separate activities.");
            sb.AppendLine($"- Prioritise what the {peakAward} needs before the move-up date, then anything close to complete.");
            sb.AppendLine("- Group requirements into as few realistic activities as possible, and use unit nights for anything that doesn't need an outing.");
            sb.AppendLine("- Keep it youth-led: where it fits, they plan and lead, following Plan > Do > Review.");
            sb.AppendLine("- Keep it practical for volunteer leaders running a weekly meeting with occasional weekend activities.");
            sb.AppendLine();

            sb.AppendLine("## What I'd like back");
            sb.AppendLine($"1. A two or three sentence summary of where {heading} stands.");
            sb.AppendLine("2. A plan up to the move-up date, by week or by month, with as few activities as possible.");
            sb.AppendLine("3. For each activity: what it is, which requirements it ticks off, the challenge area to log it under, and their role (participate, assist or lead).");
            sb.AppendLine("4. Anything that won't fit in the time left, and what to prioritise if so.");

            return sb.ToString();
        }
    }
}
