namespace Topo.Model.Insights
{
    // Insights for one youth: what they are lacking, recurring skill themes in those gaps,
    // and an activity plan for anything they are close to completing.
    public static class MemberInsightsCalculator
    {
        // A stage or milestone counts as "close" with this many items or fewer left
        public const int CloseRemaining = 4;
        public const double ClosePercent = 0.7;

        private static readonly Dictionary<string, string> StreamOutings = new Dictionary<string, string>
        {
            { "bushcraft", "bushcraft day" },
            { "bushwalking", "day bushwalk" },
            { "camping", "overnight camp" },
            { "alpine", "snow trip" },
            { "cycling", "group bike ride" },
            { "vertical", "climbing or abseiling session" },
            { "aquatics", "pool or beach session" },
            { "boating", "sailing day" },
            { "paddling", "paddling trip" },
        };

        private static readonly Dictionary<string, string> ChallengeAreaIdeas = new Dictionary<string, string>
        {
            { "Community", "a service project, community visit or fundraiser" },
            { "Outdoors", "a hike, wide game or outdoor skills session" },
            { "Creative", "a build, craft, cooking or performance challenge" },
            { "Personal Growth", "a goal setting, first aid or wellbeing session" },
        };

        // Phrases that mean one activity cannot satisfy the requirement
        private static readonly string[] RepeatPhrases = new[] { "at least two", "at least three", "at least 2", "at least 3", "two or more", "nights", "several" };

        public static MemberInsightsReport Build(YouthRecord youth, List<OASRequirementStatus> requirements, HashSet<(string Stream, int Stage)> startedStages, SectionRules rules, DateTime today, bool includeNonCoreOAS = false, int minStage = 1, int highestStage = InsightsCalculator.MaxStage)
        {
            requirements = requirements.Where(r => r.Stage >= minStage && r.Stage <= highestStage).ToList();
            startedStages = startedStages.Where(s => s.Stage >= minStage && s.Stage <= highestStage).ToHashSet();
            if (!includeNonCoreOAS)
            {
                requirements = requirements.Where(r => InsightsCalculator.IsCoreStream(r.Stream)).ToList();
                startedStages = startedStages.Where(s => InsightsCalculator.IsCoreStream(s.Stream)).ToHashSet();
            }

            var report = new MemberInsightsReport
            {
                Rules = rules,
                PeakAwardTasks = InsightsCalculator.PeakAwardTasks(youth, rules, requirements),
                PeakAwardBreakdown = InsightsCalculator.PeakAwardBreakdown(youth.Progress, rules),
                Milestone = MilestoneProgressFor(youth),
                Stages = StageProgressFor(youth, requirements, startedStages)
            };

            if (youth.DateOfBirth.HasValue)
            {
                report.MoveUpDate = InsightsCalculator.MoveUpDate(youth.DateOfBirth.Value, rules);
                report.MonthsToMoveUp = Math.Round((report.MoveUpDate.Value - today).TotalDays / 30.44, 1);
            }

            report.Themes = ThemeGaps(report.Stages);

            if (report.Milestone != null && report.Milestone.IsClose)
                report.CloseToComplete.Add(MilestoneActivity(report.Milestone));
            foreach (var stage in report.Stages.Where(s => s.IsClose).OrderBy(s => s.Remaining.Count))
                report.CloseToComplete.Add(StageActivity(stage, report.Milestone));

            report.Highlights = Highlights(report);
            return report;
        }

        public static MilestoneProgress? MilestoneProgressFor(YouthRecord youth)
        {
            if (youth.Progress.Milestone3Awarded.HasValue)
                return null;
            var (number, counts, leadAssist) = InsightsCalculator.CurrentMilestone(youth.Progress);
            var need = InsightsCalculator.MilestoneRequirements[number];
            var progress = new MilestoneProgress
            {
                Number = number,
                Participates = InsightsCalculator.ChallengeAreas
                    .Select((area, i) => new ChallengeAreaNeed { ChallengeArea = area, Have = counts[i], Need = need.Participate })
                    .ToList(),
                LeadAssist = new ChallengeAreaNeed { ChallengeArea = "Lead / Assist", Have = leadAssist, Need = need.LeadAssist }
            };
            progress.IsClose = progress.Remaining > 0 && progress.Remaining <= CloseRemaining;
            return progress;
        }

        public static List<StageProgress> StageProgressFor(YouthRecord youth, List<OASRequirementStatus> requirements, HashSet<(string Stream, int Stage)> startedStages)
        {
            return requirements
                .Where(r => r.MemberId == youth.MemberId)
                .Where(r => SkillThemeClassifier.NormaliseGroup(r.InputGroup) != "Verify")
                .GroupBy(r => (r.Stream, r.Stage))
                .Select(g =>
                {
                    var remaining = g.Where(r => !r.Answered)
                        .Select(r => new RemainingRequirement
                        {
                            InputGroup = SkillThemeClassifier.NormaliseGroup(r.InputGroup),
                            InputLabel = r.InputLabel,
                            Theme = SkillThemeClassifier.Classify(r.InputGroup, r.InputLabel),
                            UnitNightSuitable = SkillThemeClassifier.IsUnitNightSuitable(r.InputGroup, r.InputLabel)
                        })
                        .ToList();
                    var stage = new StageProgress
                    {
                        Stream = g.Key.Stream,
                        StreamDisplay = InsightsCalculator.StreamDisplay(g.Key.Stream),
                        Stage = g.Key.Stage,
                        Started = startedStages.Contains(g.Key) || remaining.Count < g.Count(),
                        Total = g.Count(),
                        Done = g.Count(r => r.Answered),
                        Remaining = remaining
                    };
                    stage.IsClose = stage.Started && remaining.Count > 0
                        && (remaining.Count <= CloseRemaining || stage.PercentDone >= ClosePercent);
                    return stage;
                })
                .Where(s => s.Remaining.Any())
                .OrderByDescending(s => s.Started)
                .ThenByDescending(s => s.PercentDone)
                .ThenBy(s => s.Stream)
                .ToList();
        }

        public static List<MemberThemeGap> ThemeGaps(List<StageProgress> stages)
        {
            return stages
                .SelectMany(s => s.Remaining.Select(r => (Stage: s, Requirement: r)))
                .GroupBy(x => x.Requirement.Theme)
                .Select(g => new MemberThemeGap
                {
                    Theme = g.Key,
                    Description = SkillThemeClassifier.DescriptionFor(g.Key),
                    Count = g.Count(),
                    Stages = g.Select(x => $"{x.Stage.StreamDisplay} {x.Stage.Stage}").Distinct().ToList(),
                    UnitNightSuitable = g.All(x => x.Requirement.UnitNightSuitable)
                })
                .OrderByDescending(t => t.Stages.Count)
                .ThenByDescending(t => t.Count)
                .ToList();
        }

        public static ActivitySuggestion MilestoneActivity(MilestoneProgress milestone)
        {
            var steps = new List<ActivityStep>();
            foreach (var area in milestone.Participates.Where(p => p.Remaining > 0))
            {
                steps.Add(new ActivityStep
                {
                    Phase = $"Participate: {area.ChallengeArea} x{area.Remaining}",
                    Items = new List<string> { ChallengeAreaIdeas[area.ChallengeArea] }
                });
            }
            if (milestone.LeadAssist.Remaining > 0)
            {
                steps.Add(new ActivityStep
                {
                    Phase = $"Lead or assist x{milestone.LeadAssist.Remaining}",
                    Items = new List<string> { "Give them a lead or assist role on upcoming patrol or unit activities, in any challenge area" }
                });
            }

            var activityCount = milestone.Remaining;
            var suggestion = new ActivitySuggestion
            {
                Kind = "Milestone",
                Target = $"Milestone {milestone.Number}",
                CoversAll = activityCount == 1,
                Steps = steps
            };
            if (activityCount == 1)
            {
                var step = steps.Single();
                suggestion.Title = $"One more activity completes Milestone {milestone.Number}";
                suggestion.Summary = $"{step.Phase.Split(" x")[0]}: {step.Items[0]}.";
                suggestion.Steps = new List<ActivityStep>();
            }
            else
            {
                suggestion.Title = $"{activityCount} activities from Milestone {milestone.Number}";
                suggestion.Summary = "Each activity counts once, in one challenge area and one role, so these need separate activities. A camp weekend with each session logged as its own activity can cover them together.";
            }
            return suggestion;
        }

        public static ActivitySuggestion StageActivity(StageProgress stage, MilestoneProgress? milestone)
        {
            var outingItems = stage.Remaining.Where(r => r.InputGroup == "Do" && !r.UnitNightSuitable).ToList();
            var needsOuting = outingItems.Any();
            var repeatItems = stage.Remaining.Where(r => RepeatPhrases.Any(p => r.InputLabel.Contains(p, StringComparison.OrdinalIgnoreCase))).ToList();
            var outing = StreamOutings.TryGetValue(stage.Stream, out var o) ? o : "outing";
            var target = $"{stage.StreamDisplay} Stage {stage.Stage}";

            var suggestion = new ActivitySuggestion
            {
                Kind = "OAS",
                Target = target,
                CoversAll = !repeatItems.Any()
            };

            if (needsOuting)
            {
                suggestion.Title = $"A {outing} to finish {target}";
                suggestion.Steps = new List<ActivityStep>
                {
                    new ActivityStep { Phase = "Before: planning session", Items = Labels(stage, r => r.InputGroup == "Plan") },
                    new ActivityStep { Phase = $"On the {outing}", Items = Labels(stage, r => r.InputGroup == "Do") },
                    new ActivityStep { Phase = "After: review", Items = Labels(stage, r => r.InputGroup == "Review") }
                };
            }
            else
            {
                suggestion.Title = $"One unit night to finish {target}";
                suggestion.Steps = new List<ActivityStep>
                {
                    new ActivityStep { Phase = "Plan", Items = Labels(stage, r => r.InputGroup == "Plan") },
                    new ActivityStep { Phase = "Skills", Items = Labels(stage, r => r.InputGroup == "Do") },
                    new ActivityStep { Phase = "Review", Items = Labels(stage, r => r.InputGroup == "Review") }
                };
            }
            suggestion.Steps = suggestion.Steps.Where(s => s.Items.Any()).ToList();

            var themes = stage.Remaining.Select(r => r.Theme).Where(t => t != SkillThemeClassifier.OtherTheme && t != SkillThemeClassifier.OutingTheme).Distinct().ToList();
            suggestion.Summary = $"{stage.Remaining.Count} requirement{(stage.Remaining.Count == 1 ? "" : "s")} left ({stage.Done}/{stage.Total} done)."
                + (themes.Any() ? $" Build it around {string.Join(", ", themes)}." : "");

            foreach (var item in repeatItems)
                suggestion.Notes.Add($"Needs more than one activity: \"{item.InputLabel}\"");
            if (needsOuting && milestone != null && milestone.Participates.Any(p => p.ChallengeArea == "Outdoors" && p.Remaining > 0))
                suggestion.Notes.Add($"Logged as an Outdoors activity it also counts towards Milestone {milestone.Number}.");
            return suggestion;
        }

        private static List<string> Labels(StageProgress stage, Func<RemainingRequirement, bool> predicate)
        {
            return stage.Remaining.Where(predicate).Select(r => r.InputLabel).ToList();
        }

        private static List<string> Highlights(MemberInsightsReport report)
        {
            var highlights = new List<string>();
            if (report.MonthsToMoveUp.HasValue && report.MoveUpDate.HasValue)
            {
                var months = report.MonthsToMoveUp.Value;
                var outstanding = report.PeakAwardTasks.Count(t => !t.Done);
                var when = months < 0 ? $"was due to move up in {report.MoveUpDate:MMM yyyy}" : $"moves up around {report.MoveUpDate:MMM yyyy} ({months:0.#} months)";
                highlights.Add($"{when[..1].ToUpper()}{when[1..]}, with {outstanding} {report.Rules.PeakAwardName} item{(outstanding == 1 ? "" : "s")} outstanding.");
            }
            if (report.Milestone != null && report.Milestone.IsClose)
                highlights.Add($"{report.Milestone.Remaining} {(report.Milestone.Remaining == 1 ? "activity" : "activities")} from completing Milestone {report.Milestone.Number}.");
            foreach (var stage in report.Stages.Where(s => s.IsClose))
                highlights.Add($"{stage.Remaining.Count} {(stage.Remaining.Count == 1 ? "requirement" : "requirements")} from finishing {stage.StreamDisplay} Stage {stage.Stage}.");
            if (report.Milestone != null && !report.Milestone.IsClose)
            {
                var weakest = report.Milestone.Participates.OrderByDescending(p => p.Remaining).First();
                if (weakest.Remaining > 0)
                    highlights.Add($"Milestone {report.Milestone.Number}: {report.Milestone.Remaining} activities to go, most needed in {weakest.ChallengeArea} ({weakest.Remaining}).");
            }
            var recurring = report.Themes.FirstOrDefault(t => t.Stages.Count > 1 && t.Theme != SkillThemeClassifier.OtherTheme);
            if (recurring != null)
                highlights.Add($"Recurring gap: {recurring.Theme} shows up in {string.Join(" and ", recurring.Stages)}.");
            else if (report.Themes.Any())
                highlights.Add($"Biggest gap: {report.Themes.OrderByDescending(t => t.Count).First().Theme}.");
            return highlights;
        }
    }
}
