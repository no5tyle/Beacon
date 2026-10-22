using Topo.Model.Wallchart;

namespace Topo.Model.Insights
{
    // Pure analysis over data already gathered for the wallchart and OAS worksheet.
    // Kept free of API calls so it can be unit tested against the report fixtures.
    public static class InsightsCalculator
    {
        public class StreamInfo
        {
            public string Key = "";
            public string Display = "";
            public bool IsCore;
        }

        public static readonly List<StreamInfo> Streams = new List<StreamInfo>
        {
            new StreamInfo { Key = "bushcraft", Display = "Bushcraft", IsCore = true },
            new StreamInfo { Key = "bushwalking", Display = "Bushwalking", IsCore = true },
            new StreamInfo { Key = "camping", Display = "Camping", IsCore = true },
            new StreamInfo { Key = "alpine", Display = "Alpine" },
            new StreamInfo { Key = "cycling", Display = "Cycling" },
            new StreamInfo { Key = "vertical", Display = "Vertical" },
            new StreamInfo { Key = "aquatics", Display = "Aquatics" },
            new StreamInfo { Key = "boating", Display = "Boating" },
            new StreamInfo { Key = "paddling", Display = "Paddling" },
        };

        public const int MaxStage = 9;

        internal static readonly string[] ChallengeAreas = new[] { "Community", "Outdoors", "Creative", "Personal Growth" };

        // Participates per challenge area and lead/assist count needed for each milestone
        internal static readonly (int Participate, int LeadAssist)[] MilestoneRequirements = new[]
        {
            (0, 0),
            (6, 2),
            (5, 4),
            (4, 6)
        };

        public static int StageFor(WallchartItemModel progress, string stream)
        {
            return stream switch
            {
                "bushcraft" => progress.OASBushcraftStage,
                "bushwalking" => progress.OASBushwalkingStage,
                "camping" => progress.OASCampingStage,
                "alpine" => progress.OASAlpineStage,
                "cycling" => progress.OASCyclingStage,
                "vertical" => progress.OASVerticalStage,
                "aquatics" => progress.OASAquaticsStage,
                "boating" => progress.OASBoatingStage,
                "paddling" => progress.OASPaddlingStage,
                _ => 0
            };
        }

        public static bool IsCoreStream(string stream)
        {
            return Streams.Any(s => s.Key == stream && s.IsCore);
        }

        public static string StreamDisplay(string stream)
        {
            return Streams.FirstOrDefault(s => s.Key == stream)?.Display ?? stream;
        }

        public static InsightsReport Build(string section, List<YouthRecord> youth, List<OASRequirementStatus> requirements, InsightsSettings settings, DateTime today, ICollection<string>? focusIds = null)
        {
            var rules = settings.RulesFor(section);
            var minStage = settings.MinimumStage(section);
            var highestStage = settings.MaximumStage(section);
            if (!settings.IncludeNonCoreOAS)
                requirements = requirements.Where(r => IsCoreStream(r.Stream)).ToList();
            requirements = requirements.Where(r => r.Stage >= minStage && r.Stage <= highestStage).ToList();
            var candidates = MoveUpCandidates(youth, rules, settings, today, requirements, focusIds);
            var priorityIds = candidates.Select(c => c.MemberId).ToHashSet();
            var names = youth.ToDictionary(y => y.MemberId, y => y.MemberName);

            var gaps = RequirementGaps(youth, requirements, priorityIds);
            var deficits = ChallengeAreaDeficits(youth);
            var themes = SkillThemes(gaps, priorityIds);

            return new InsightsReport
            {
                GeneratedOn = today,
                Section = section,
                Rules = rules,
                YouthCount = youth.Count,
                MinimumStage = minStage,
                MaximumStage = highestStage,
                MemberNames = names,
                StreamCoverage = StreamCoverage(youth, settings.IncludeNonCoreOAS),
                NextStageDemand = NextStageDemand(youth, priorityIds, settings.IncludeNonCoreOAS, minStage, highestStage),
                RequirementGaps = gaps,
                MoveUpCandidates = candidates,
                PriorityTaskBoard = PriorityTaskBoard(candidates),
                ChallengeAreaDeficits = deficits,
                SkillThemes = themes,
                SuggestedNights = SuggestNights(themes, deficits, candidates, names, settings.SuggestedNights)
            };
        }

        // OAS trends

        public static List<StreamCoverage> StreamCoverage(List<YouthRecord> youth, bool includeNonCore = false)
        {
            var coverage = new List<StreamCoverage>();
            foreach (var stream in Streams.Where(s => includeNonCore || s.IsCore))
            {
                var stages = youth.Select(y => StageFor(y.Progress, stream.Key)).ToList();
                var item = new StreamCoverage
                {
                    Stream = stream.Key,
                    StreamDisplay = stream.Display,
                    IsCore = stream.IsCore,
                    NotStarted = stages.Count(s => s == 0),
                    AverageStage = stages.Count == 0 ? 0 : stages.Average(),
                    HighestStage = stages.Count == 0 ? 0 : stages.Max()
                };
                for (int stage = 1; stage <= MaxStage; stage++)
                {
                    item.ReachedStage[stage] = stages.Count(s => s >= stage);
                    item.NextStageMemberIds[stage] = youth.Where(y => StageFor(y.Progress, stream.Key) == stage - 1).Select(y => y.MemberId).ToList();
                    item.WorkingOnMemberIds[stage] = youth.Where(y => IsActivelyWorking(y.Progress, stream.Key, stage)).Select(y => y.MemberId).ToHashSet();
                }
                coverage.Add(item);
            }
            return coverage;
        }

        // The stage each youth would work on next, grouped. Core streams always count,
        // optional streams only once a youth has started them.
        public static List<StageDemand> NextStageDemand(List<YouthRecord> youth, HashSet<string> priorityIds, bool includeNonCore = false, int minStage = 1, int highestStage = MaxStage)
        {
            var demand = new Dictionary<(string, int), StageDemand>();
            foreach (var member in youth)
            {
                foreach (var stream in Streams.Where(s => includeNonCore || s.IsCore))
                {
                    var current = StageFor(member.Progress, stream.Key);
                    if (current >= MaxStage || current + 1 < minStage || current + 1 > highestStage || (!stream.IsCore && current == 0))
                        continue;
                    var key = (stream.Key, current + 1);
                    if (!demand.TryGetValue(key, out var item))
                    {
                        item = new StageDemand { Stream = stream.Key, StreamDisplay = stream.Display, Stage = current + 1 };
                        demand[key] = item;
                    }
                    item.MemberIds.Add(member.MemberId);
                    if (priorityIds.Contains(member.MemberId))
                        item.PriorityMemberCount++;
                }
            }
            return demand.Values
                .OrderByDescending(d => d.PriorityMemberCount * 2 + d.Count)
                .ThenBy(d => d.Stage)
                .ToList();
        }

        // Which stream/stages are worth fetching requirement detail for: stages youth are actively
        // working on and the most common next stages, plus every next core stage and started stage
        // of youth moving up soon.
        public static List<(string Stream, int Stage)> StagesForDetail(List<StageDemand> demand, List<MoveUpCandidate> candidates, List<YouthRecord> youth, int maxStages, bool includeNonCore = false, int minStage = 1, int highestStage = MaxStage)
        {
            var scores = new Dictionary<(string, int), int>();
            foreach (var d in demand)
                scores[(d.Stream, d.Stage)] = d.Count;
            foreach (var stage in youth.SelectMany(y => y.Progress.OASStagesInProgress).Select(ParseStageKey).Where(k => k.HasValue).Select(k => k!.Value))
            {
                if ((!includeNonCore && !IsCoreStream(stage.Stream)) || stage.Stage < minStage || stage.Stage > highestStage)
                    continue;
                scores[stage] = scores.GetValueOrDefault(stage) + 3;
            }

            var selected = scores.Where(s => s.Key.Item2 >= minStage && s.Key.Item2 <= highestStage).OrderByDescending(s => s.Value).ThenBy(s => s.Key.Item2).Take(maxStages).Select(s => s.Key).ToList();
            var candidateIds = candidates.Select(c => c.MemberId).ToHashSet();
            foreach (var member in youth.Where(y => candidateIds.Contains(y.MemberId)))
            {
                var stages = Streams.Where(s => s.IsCore)
                    .Select(s => (s.Key, StageFor(member.Progress, s.Key) + 1))
                    .Where(s => s.Item2 <= MaxStage)
                    .Concat(member.Progress.OASStagesInProgress.Select(ParseStageKey).Where(k => k.HasValue).Select(k => k!.Value))
                    .Where(s => includeNonCore || IsCoreStream(s.Item1))
                    .Where(s => s.Item2 >= minStage && s.Item2 <= highestStage);
                foreach (var stage in stages)
                {
                    if (!selected.Contains(stage))
                        selected.Add(stage);
                }
            }
            return selected;
        }

        private static (string Stream, int Stage)? ParseStageKey(string key)
        {
            var parts = key.Split('/');
            return parts.Length == 2 && int.TryParse(parts[1], out var stage) ? (parts[0], stage) : null;
        }

        // Youth can work on several stages of a stream at once. Terrain gives credit for a stage
        // once the stage three below it is complete, so Stages 1 to 3 are open to everyone.
        public static bool IsEligible(WallchartItemModel progress, string stream, int stage)
        {
            var highest = StageFor(progress, stream);
            return highest < stage && (stage <= 3 || highest >= stage - 3);
        }

        public static bool IsActivelyWorking(WallchartItemModel progress, string stream, int stage)
        {
            return progress.OASStagesInProgress.Contains($"{stream}/{stage}");
        }

        public static List<RequirementGap> RequirementGaps(List<YouthRecord> youth, List<OASRequirementStatus> requirements, HashSet<string> priorityIds)
        {
            var progressById = youth.ToDictionary(y => y.MemberId, y => y.Progress);
            var completedCounts = new Dictionary<(string, int), int>();
            int CompletedFor(string stream, int stage)
            {
                if (!completedCounts.TryGetValue((stream, stage), out var count))
                {
                    count = youth.Count(y => StageFor(y.Progress, stream) >= stage);
                    completedCounts[(stream, stage)] = count;
                }
                return count;
            }

            return requirements
                .Where(r => progressById.TryGetValue(r.MemberId, out var p) && IsEligible(p, r.Stream, r.Stage))
                .Where(r => SkillThemeClassifier.NormaliseGroup(r.InputGroup) != "Verify")
                .GroupBy(r => (r.Stream, r.Stage, Group: SkillThemeClassifier.NormaliseGroup(r.InputGroup), r.InputLabel))
                .Select(g =>
                {
                    var outstanding = g.Where(r => !r.Answered).Select(r => r.MemberId).Distinct().ToList();
                    var active = g.Where(r => IsActivelyWorking(progressById[r.MemberId], r.Stream, r.Stage)).ToList();
                    return new RequirementGap
                    {
                        Stream = g.Key.Stream,
                        StreamDisplay = StreamDisplay(g.Key.Stream),
                        Stage = g.Key.Stage,
                        InputGroup = g.Key.Group,
                        InputLabel = g.Key.InputLabel,
                        InputDetail = g.Select(r => r.InputDetail).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d)) ?? "",
                        Theme = SkillThemeClassifier.Classify(g.Key.Group, g.Key.InputLabel),
                        UnitNightSuitable = SkillThemeClassifier.IsUnitNightSuitable(g.Key.Group, g.Key.InputLabel),
                        // Youth who have completed the stage count towards the total as already done
                        CompletedCount = CompletedFor(g.Key.Stream, g.Key.Stage),
                        CandidateCount = g.Select(r => r.MemberId).Distinct().Count() + CompletedFor(g.Key.Stream, g.Key.Stage),
                        OutstandingMemberIds = outstanding,
                        ActiveCandidateCount = active.Select(r => r.MemberId).Distinct().Count(),
                        ActiveOutstandingMemberIds = active.Where(r => !r.Answered).Select(r => r.MemberId).Distinct().ToList(),
                        PriorityMemberCount = outstanding.Count(priorityIds.Contains)
                    };
                })
                .Where(g => g.OutstandingCount > 0)
                .OrderByDescending(g => g.ActiveOutstandingCount * 2 + g.PriorityMemberCount * 2 + g.OutstandingCount)
                .ThenBy(g => g.Stream)
                .ThenBy(g => g.Stage)
                .ToList();
        }

        // Move up priorities

        public static DateTime MoveUpDate(DateTime dateOfBirth, SectionRules rules)
        {
            return dateOfBirth.AddMonths((int)Math.Round(rules.MoveUpAgeYears * 12));
        }

        // Youth moving up within the window, plus any focus youth, who are weighted the same way
        public static List<MoveUpCandidate> MoveUpCandidates(List<YouthRecord> youth, SectionRules rules, InsightsSettings settings, DateTime today, List<OASRequirementStatus>? requirements = null, ICollection<string>? focusIds = null)
        {
            var candidates = new List<MoveUpCandidate>();
            foreach (var member in youth)
            {
                DateTime? moveUpDate = member.DateOfBirth.HasValue ? MoveUpDate(member.DateOfBirth.Value, rules) : null;
                double? monthsRemaining = moveUpDate.HasValue ? (moveUpDate.Value - today).TotalDays / 30.44 : null;
                var isMovingUp = monthsRemaining.HasValue && monthsRemaining.Value <= settings.MoveUpWindowMonths;
                var isFocus = focusIds != null && focusIds.Contains(member.MemberId);
                if (!isMovingUp && !isFocus)
                    continue;

                var candidate = new MoveUpCandidate
                {
                    MemberId = member.MemberId,
                    MemberName = member.MemberName,
                    Patrol = member.Patrol,
                    AgeDisplay = member.DateOfBirth.HasValue ? AgeDisplay(member.DateOfBirth.Value, today) : "",
                    MoveUpDate = moveUpDate,
                    MonthsRemaining = monthsRemaining.HasValue ? Math.Round(monthsRemaining.Value, 1) : null,
                    IsMovingUp = isMovingUp,
                    IsFocus = isFocus,
                    // Focus youth who aren't moving up soon sit alongside the medium urgency group
                    Urgency = !isMovingUp ? Urgency.Medium : monthsRemaining <= 3 ? Urgency.High : monthsRemaining <= 6 ? Urgency.Medium : Urgency.Low,
                    Tasks = PeakAwardTasks(member, rules, requirements ?? new List<OASRequirementStatus>()),
                    PeakAwardBreakdown = PeakAwardBreakdown(member.Progress, rules)
                };
                var effectiveMonths = isMovingUp ? monthsRemaining!.Value : settings.MoveUpWindowMonths;
                candidate.PriorityScore = Math.Round(OutstandingWeight(candidate.Tasks) / Math.Max(effectiveMonths, 0.5), 2);
                candidates.Add(candidate);
            }
            return candidates
                .OrderBy(c => c.Urgency)
                .ThenByDescending(c => c.PriorityScore)
                .ThenBy(c => c.MonthsRemaining ?? double.MaxValue)
                .ToList();
        }

        // Peak award progress out of 100 using Terrain's component weights, split further:
        // essentials give 9 per milestone awarded plus 3 shared by the two introductions, OAS is shared
        // equally across the stage progressions needed, SIA across the projects needed, and the
        // course, Adventurous Journey and Personal Reflection are all or nothing. No component goes
        // over its weight when a youth does more than is required.
        public static List<PeakAwardComponent> PeakAwardBreakdown(WallchartItemModel p, SectionRules rules)
        {
            var milestones = new[] { p.Milestone1Awarded, p.Milestone2Awarded, p.Milestone3Awarded }.Count(m => m.HasValue);
            var intros = new[] { p.IntroToScouting, p.IntroToSection }.Count(i => i.HasValue);
            var essentials = milestones * 9.0 + intros * 1.5;

            double oas;
            if (rules.OASStageProgressionsRequired > 0)
            {
                oas = rules.OASWeight * Math.Min(p.OASStageProgressions, rules.OASStageProgressionsRequired) / rules.OASStageProgressionsRequired;
            }
            else
            {
                // Joeys: the stages needed are Stage 1 (or the core minimum) in each core stream
                var needed = Streams.Count(s => s.IsCore) * Math.Max(rules.CoreStageRequired, 1);
                var reached = Streams.Where(s => s.IsCore).Sum(s => Math.Min(StageFor(p, s.Key), Math.Max(rules.CoreStageRequired, 1)));
                oas = rules.OASWeight * reached / needed;
            }

            var siaProjects = p.SIAAdventureSport + p.SIAArtsLiterature + p.SIAEnvironment + p.SIAStemInnovation + p.SIAGrowthDevelopment + p.SIACreatingABetterWorld;
            var sia = rules.SIAProjectsRequired > 0 ? rules.SIAWeight * Math.Min(siaProjects, rules.SIAProjectsRequired) / rules.SIAProjectsRequired : 0;

            var components = new List<PeakAwardComponent>
            {
                new PeakAwardComponent { Name = "Essentials", Max = rules.EssentialsWeight, Earned = Math.Min(essentials, rules.EssentialsWeight) },
                new PeakAwardComponent { Name = "OAS", Max = rules.OASWeight, Earned = Math.Min(oas, rules.OASWeight) },
                new PeakAwardComponent { Name = "SIA", Max = rules.SIAWeight, Earned = Math.Min(sia, rules.SIAWeight) }
            };
            if (rules.LeadershipCourseRequired && rules.CourseWeight > 0)
                components.Add(new PeakAwardComponent { Name = "Course", Max = rules.CourseWeight, Earned = p.LeadershipCourse.HasValue ? rules.CourseWeight : 0 });
            components.Add(new PeakAwardComponent { Name = "Journey", Max = rules.AdventurousJourneyWeight, Earned = p.AdventurousJourney.HasValue ? rules.AdventurousJourneyWeight : 0 });
            components.Add(new PeakAwardComponent { Name = "Reflection", Max = rules.ReflectionWeight, Earned = p.PersonalReflection.HasValue ? rules.ReflectionWeight : 0 });
            return components;
        }

        public static List<PriorityTask> PeakAwardTasks(YouthRecord member, SectionRules rules, List<OASRequirementStatus> requirements)
        {
            var p = member.Progress;
            var tasks = new List<PriorityTask>
            {
                new PriorityTask { Category = TaskCategory.Introduction, Key = "intro:scouting", Title = "Introduction to Scouting", Done = p.IntroToScouting.HasValue, UnitNightSuitable = true },
                new PriorityTask { Category = TaskCategory.Introduction, Key = "intro:section", Title = "Introduction to Section", Done = p.IntroToSection.HasValue, UnitNightSuitable = true },
                new PriorityTask { Category = TaskCategory.Milestone, Key = "milestone", Title = "Milestone 3", Done = p.Milestone3Awarded.HasValue, Detail = MilestoneDetail(p), UnitNightSuitable = true }
            };

            var progressions = p.OASStageProgressions;
            if (rules.OASStageProgressionsRequired > 0)
            {
                tasks.Add(new PriorityTask
                {
                    Category = TaskCategory.OAS,
                    Key = "oas",
                    Title = $"{rules.OASStageProgressionsRequired} OAS stage progressions",
                    Done = progressions >= rules.OASStageProgressionsRequired,
                    Detail = $"{progressions} of {rules.OASStageProgressionsRequired}. {ClosestStages(member, requirements)}".Trim()
                });
            }

            if (rules.OASHighStageProgressionsRequired > 0)
            {
                var highStages = p.OASSectionStagesAwarded.Count(stage => stage >= rules.OASHighStage);
                tasks.Add(new PriorityTask
                {
                    Category = TaskCategory.OAS,
                    Key = "oas:high",
                    Title = $"{rules.OASHighStageProgressionsRequired} progressions at Stage {rules.OASHighStage} or above",
                    Done = highStages >= rules.OASHighStageProgressionsRequired,
                    Detail = $"{highStages} of {rules.OASHighStageProgressionsRequired}"
                });
            }

            if (rules.CoreStageRequired > 0)
            {
                var below = Streams.Where(s => s.IsCore)
                    .Select(s => (s.Display, Stage: StageFor(p, s.Key)))
                    .Where(s => s.Stage < rules.CoreStageRequired)
                    .ToList();
                tasks.Add(new PriorityTask
                {
                    Category = TaskCategory.OAS,
                    Key = "oas:core",
                    Title = $"Stage {rules.CoreStageRequired} in all core OAS",
                    Done = !below.Any(),
                    Detail = below.Any() ? $"Below Stage {rules.CoreStageRequired}: {string.Join(", ", below.Select(b => $"{b.Display} {b.Stage}"))}" : ""
                });
            }

            var siaCount = p.SIAAdventureSport + p.SIAArtsLiterature + p.SIAEnvironment + p.SIAStemInnovation + p.SIAGrowthDevelopment + p.SIACreatingABetterWorld;
            var siaAreas = new[] { p.SIAAdventureSport, p.SIAArtsLiterature, p.SIAEnvironment, p.SIAStemInnovation, p.SIAGrowthDevelopment, p.SIACreatingABetterWorld }.Count(c => c > 0);
            if (rules.SIAProjectsRequired > 0)
            {
                tasks.Add(new PriorityTask
                {
                    Category = TaskCategory.SIA,
                    Key = "sia",
                    Title = rules.SIAAreasRequired > 1 ? $"{rules.SIAProjectsRequired} SIA projects across {rules.SIAAreasRequired} areas" : $"{rules.SIAProjectsRequired} SIA projects",
                    Done = siaCount >= rules.SIAProjectsRequired && siaAreas >= rules.SIAAreasRequired,
                    Detail = $"{siaCount} of {rules.SIAProjectsRequired} projects, {siaAreas} of {rules.SIAAreasRequired} areas"
                });
            }

            if (rules.LeadershipCourseRequired)
                tasks.Add(new PriorityTask { Category = TaskCategory.PeakAward, Key = "peak:course", Title = "Leadership course", Done = p.LeadershipCourse.HasValue });
            tasks.Add(new PriorityTask { Category = TaskCategory.PeakAward, Key = "peak:aj", Title = "Adventurous Journey", Done = p.AdventurousJourney.HasValue });
            tasks.Add(new PriorityTask { Category = TaskCategory.PeakAward, Key = "peak:reflection", Title = "Personal Reflection", Done = p.PersonalReflection.HasValue, UnitNightSuitable = true });
            return tasks;
        }

        private static string MilestoneDetail(WallchartItemModel p)
        {
            if (p.Milestone3Awarded.HasValue)
                return "";
            var (number, counts, leadAssist) = CurrentMilestone(p);
            var need = MilestoneRequirements[number];
            var shortfalls = new List<string>();
            for (int i = 0; i < ChallengeAreas.Length; i++)
            {
                var shortBy = need.Participate - counts[i];
                if (shortBy > 0)
                    shortfalls.Add($"{ChallengeAreas[i]} {shortBy}");
            }
            if (need.LeadAssist - leadAssist > 0)
                shortfalls.Add($"lead/assist {need.LeadAssist - leadAssist}");
            var prefix = number < 3 ? $"On Milestone {number}" : "Milestone 3";
            return shortfalls.Any() ? $"{prefix}, needs {string.Join(", ", shortfalls)}" : $"{prefix} ready for review";
        }

        // Milestone number in progress, participates per challenge area and lead/assist count
        internal static (int Number, int[] Counts, int LeadAssist) CurrentMilestone(WallchartItemModel p)
        {
            if (!p.Milestone1Awarded.HasValue)
                return (1, new[] { p.Milestone1Community, p.Milestone1Outdoors, p.Milestone1Creative, p.Milestone1PersonalGrowth }, p.Milestone1Assist + p.Milestone1Lead);
            if (!p.Milestone2Awarded.HasValue)
                return (2, new[] { p.Milestone2Community, p.Milestone2Outdoors, p.Milestone2Creative, p.Milestone2PersonalGrowth }, p.Milestone2Assist + p.Milestone2Lead);
            return (3, new[] { p.Milestone3Community, p.Milestone3Outdoors, p.Milestone3Creative, p.Milestone3PersonalGrowth }, p.Milestone3Assist + p.Milestone3Lead);
        }

        // Point the leader at the core stages this youth is closest to finishing
        private static string ClosestStages(YouthRecord member, List<OASRequirementStatus> requirements)
        {
            var options = new List<(string Text, double Ratio)>();
            foreach (var stream in Streams.Where(s => s.IsCore))
            {
                var next = StageFor(member.Progress, stream.Key) + 1;
                if (next > MaxStage)
                    continue;
                var rows = requirements
                    .Where(r => r.MemberId == member.MemberId && r.Stream == stream.Key && r.Stage == next)
                    .Where(r => SkillThemeClassifier.NormaliseGroup(r.InputGroup) != "Verify")
                    .ToList();
                if (rows.Any())
                {
                    var done = rows.Count(r => r.Answered);
                    options.Add(($"{stream.Display} {next} ({done}/{rows.Count})", (double)done / rows.Count));
                }
                else
                {
                    options.Add(($"{stream.Display} {next}", -1));
                }
            }
            var closest = options.OrderByDescending(o => o.Ratio).Take(2).Select(o => o.Text);
            return $"Closest: {string.Join(", ", closest)}";
        }

        private static double OutstandingWeight(List<PriorityTask> tasks)
        {
            double weight = 0;
            foreach (var task in tasks.Where(t => !t.Done))
            {
                weight += task.Key switch
                {
                    "milestone" => 3,
                    "oas" => 2,
                    "oas:core" => 2,
                    "oas:high" => 1,
                    "sia" => 2,
                    "peak:aj" => 3,
                    "peak:course" => 2,
                    _ => 1
                };
            }
            return weight;
        }

        public static List<TaskSummary> PriorityTaskBoard(List<MoveUpCandidate> candidates)
        {
            return candidates
                .SelectMany(c => c.Tasks.Where(t => !t.Done).Select(t => (Candidate: c, Task: t)))
                .GroupBy(x => x.Task.Key)
                .Select(g => new TaskSummary
                {
                    Key = g.Key,
                    Category = g.First().Task.Category,
                    // OAS and SIA titles carry the target number, which is the same for everyone in the section
                    Title = g.First().Task.Title,
                    UnitNightSuitable = g.First().Task.UnitNightSuitable,
                    MemberNames = g.Select(x => x.Candidate.MemberName).ToList(),
                    HighUrgencyCount = g.Count(x => x.Candidate.Urgency == Urgency.High)
                })
                .OrderByDescending(t => t.HighUrgencyCount)
                .ThenByDescending(t => t.MemberNames.Count)
                .ToList();
        }

        // Programme patterns

        public static List<ChallengeAreaDeficit> ChallengeAreaDeficits(List<YouthRecord> youth)
        {
            var deficits = ChallengeAreas.Select(a => new ChallengeAreaDeficit { ChallengeArea = a }).ToList();
            var leadAssist = new ChallengeAreaDeficit { ChallengeArea = "Lead / Assist" };
            foreach (var member in youth.Where(y => !y.Progress.Milestone3Awarded.HasValue))
            {
                var (number, counts, la) = CurrentMilestone(member.Progress);
                var need = MilestoneRequirements[number];
                for (int i = 0; i < ChallengeAreas.Length; i++)
                {
                    var shortBy = need.Participate - counts[i];
                    if (shortBy > 0)
                    {
                        deficits[i].ParticipatesShort += shortBy;
                        deficits[i].YouthShort++;
                    }
                }
                if (need.LeadAssist - la > 0)
                {
                    leadAssist.ParticipatesShort += need.LeadAssist - la;
                    leadAssist.YouthShort++;
                }
            }
            deficits.Add(leadAssist);
            return deficits.OrderByDescending(d => d.ParticipatesShort).ToList();
        }

        public static List<SkillTheme> SkillThemes(List<RequirementGap> gaps, HashSet<string> priorityIds)
        {
            return gaps
                .Where(g => g.UnitNightSuitable)
                .GroupBy(g => g.Theme)
                .Select(g =>
                {
                    var memberIds = g.SelectMany(r => r.OutstandingMemberIds).Distinct().ToList();
                    var activeIds = g.SelectMany(r => r.ActiveOutstandingMemberIds).Distinct().ToList();
                    return new SkillTheme
                    {
                        Name = g.Key,
                        Description = SkillThemeClassifier.DescriptionFor(g.Key),
                        OutstandingRequirements = g.Sum(r => r.OutstandingCount),
                        MemberIds = memberIds,
                        ActiveMemberIds = activeIds,
                        PriorityMemberCount = memberIds.Count(priorityIds.Contains),
                        Requirements = g.OrderByDescending(r => r.ActiveOutstandingCount * 2 + r.PriorityMemberCount * 2 + r.OutstandingCount).ToList()
                    };
                })
                .OrderByDescending(t => t.Score)
                .ToList();
        }

        public static List<NightSuggestion> SuggestNights(List<SkillTheme> themes, List<ChallengeAreaDeficit> deficits, List<MoveUpCandidate> candidates, Dictionary<string, string> names, int count)
        {
            var nights = new List<NightSuggestion>();
            var priorityIds = candidates.Select(c => c.MemberId).ToHashSet();

            foreach (var theme in themes.Where(t => t.Name != SkillThemeClassifier.OtherTheme).Take(Math.Max(count - 1, 1)))
            {
                nights.Add(new NightSuggestion
                {
                    Title = $"{theme.Name} night",
                    Focus = theme.Description,
                    ChallengeArea = SkillThemeClassifier.ChallengeAreaFor(theme.Name),
                    Covers = theme.Requirements.Take(4)
                        .Select(r => $"{r.StreamDisplay} {r.Stage}: {r.InputLabel} ({r.OutstandingCount} youth)")
                        .ToList(),
                    MemberNames = theme.MemberIds.Select(id => names.TryGetValue(id, out var n) ? n : id).OrderBy(n => n).ToList(),
                    PriorityMemberCount = theme.MemberIds.Count(priorityIds.Contains)
                });
            }

            // Balance the programme towards the challenge area youth are most short of for milestones
            var gap = deficits.Where(d => d.ChallengeArea != "Lead / Assist" && d.ParticipatesShort > 0).FirstOrDefault();
            var leadGap = deficits.FirstOrDefault(d => d.ChallengeArea == "Lead / Assist");
            if (gap != null && nights.Count < count)
            {
                var focus = $"{gap.YouthShort} youth are short {gap.ParticipatesShort} {gap.ChallengeArea} participates for their current milestone.";
                if (leadGap != null && leadGap.YouthShort > 0)
                    focus += $" Give lead/assist roles to the {leadGap.YouthShort} youth who need them.";
                nights.Add(new NightSuggestion
                {
                    Title = $"{gap.ChallengeArea} challenge night",
                    Focus = focus,
                    ChallengeArea = gap.ChallengeArea
                });
            }

            for (int i = 0; i < nights.Count; i++)
                nights[i].Number = i + 1;
            return nights;
        }

        private static string AgeDisplay(DateTime dateOfBirth, DateTime today)
        {
            int months = (today.Year - dateOfBirth.Year) * 12 + today.Month - dateOfBirth.Month;
            if (today.Day < dateOfBirth.Day)
                months--;
            return $"{months / 12}y {months % 12}m";
        }
    }
}
