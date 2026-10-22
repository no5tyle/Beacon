using System.Text.RegularExpressions;

namespace Topo.Model.Insights
{
    // Groups OAS requirement wording into skill themes that can be run as a unit night,
    // and decides whether a requirement can realistically be ticked off at a regular meeting.
    public static class SkillThemeClassifier
    {
        public const string PlanningTheme = "Trip Planning";
        public const string ReviewTheme = "Review & Reflection";
        public const string OtherTheme = "Other Skills";
        public const string VerifyTheme = "Logbook";
        public const string OutingTheme = "Outings & Activities";

        private class ThemeDefinition
        {
            public string Name = "";
            public string Description = "";
            public string ChallengeArea = "Outdoors";
            public string[] Keywords = new string[0];
        }

        // First match wins, so more specific themes come first
        private static readonly List<ThemeDefinition> Themes = new List<ThemeDefinition>
        {
            new ThemeDefinition { Name = "Knots & Lashings", Description = "Knot tying, lashings and rope work stations", Keywords = new[] { "knot", "lashing", "rope", "hitch", "splice", "whipping", "bowline" } },
            new ThemeDefinition { Name = "Navigation & Maps", Description = "Map reading, compass bearings and orienteering games", Keywords = new[] { "map", "compass", "navigat", "bearing", "grid reference", "gps", "topograph", "orienteer", "lost", "route card" } },
            new ThemeDefinition { Name = "First Aid & Safety", Description = "First aid scenarios, emergency plans and risk management", ChallengeArea = "Personal Growth", Keywords = new[] { "first aid", "injur", "bleed", "cuts", "burn", "bite", "sting", "hypotherm", "dehydrat", "emergency", "safety", "safe", "risk", "buddy" } },
            new ThemeDefinition { Name = "Water Skills", Description = "Water safety, PFDs and rescue techniques (pool or classroom)", Keywords = new[] { "swim", "water safety", "paddl", "boat", "canoe", "kayak", "life jacket", "pfd", "rescue", "capsiz", "throw bag" } },
            new ThemeDefinition { Name = "Cooking & Menus", Description = "Menu planning, stove safety and a cook-off", ChallengeArea = "Creative", Keywords = new[] { "cook", "menu", "food", "meal", "stove", "trangia", "hygiene", "nutrition", "ration" } },
            new ThemeDefinition { Name = "Fire, Tools & Shelter", Description = "Fire lighting, knife/axe/saw safety and shelter building", Keywords = new[] { "fire", "knife", "axe", "saw", "tool", "shelter", "whittl", "tarp", "hutchie" } },
            new ThemeDefinition { Name = "Gear & Packing", Description = "Pack-a-pack challenge, tent pitching and gear care", Keywords = new[] { "pack", "gear", "equipment", "clothing", "backpack", "tent", "sleeping bag", "pitch", "layers" } },
            new ThemeDefinition { Name = "Weather & Environment", Description = "Weather reading, Leave No Trace and local flora/fauna", ChallengeArea = "Community", Keywords = new[] { "weather", "forecast", "environment", "leave no trace", "minimal impact", "etiquette", "wildlife", "flora", "fauna", "plants", "animals", "conservation", "rubbish", "country", "indigenous" } },
        };

        // Phrases that mean the requirement needs an outing, not a unit night
        internal static readonly string[] OutingPhrases = new[]
        {
            "attended", "participated in", "have been on", "have gone on", "overnight", "day bushwalk", "day hike",
            "nights", "hours duration", "at least two", "at least three", "at least one", "journey", "camp for", "on a camp", "expedition"
        };

        public static string Classify(string inputGroup, string inputLabel)
        {
            var group = NormaliseGroup(inputGroup);
            if (group == "Verify")
                return VerifyTheme;

            var theme = Themes.FirstOrDefault(t => t.Keywords.Any(k => ContainsWord(inputLabel, k)));
            if (theme != null)
                return theme.Name;

            if (group == "Plan")
                return PlanningTheme;
            if (group == "Review")
                return ReviewTheme;
            if (OutingPhrases.Any(p => (inputLabel ?? "").Contains(p, StringComparison.OrdinalIgnoreCase)))
                return OutingTheme;
            return OtherTheme;
        }

        public static bool IsUnitNightSuitable(string inputGroup, string inputLabel)
        {
            var group = NormaliseGroup(inputGroup);
            if (group == "Verify")
                return false;
            // Plan and Review items are discussion based so fit a regular meeting
            if (group == "Plan" || group == "Review")
                return true;
            if (OutingPhrases.Any(p => inputLabel.Contains(p, StringComparison.OrdinalIgnoreCase)))
                return false;
            return Classify(inputGroup, inputLabel) != OtherTheme;
        }

        public static string DescriptionFor(string theme)
        {
            var definition = Themes.FirstOrDefault(t => t.Name == theme);
            if (definition != null)
                return definition.Description;
            return theme switch
            {
                PlanningTheme => "Patrols plan an upcoming activity: route, menu, gear list and risk assessment",
                ReviewTheme => "Patrol presentations and reflections on recent activities",
                _ => "Assorted skills from outstanding OAS requirements"
            };
        }

        public static string ChallengeAreaFor(string theme)
        {
            var definition = Themes.FirstOrDefault(t => t.Name == theme);
            if (definition != null)
                return definition.ChallengeArea;
            return theme switch
            {
                PlanningTheme => "Outdoors",
                ReviewTheme => "Personal Growth",
                _ => "Outdoors"
            };
        }

        public static string NormaliseGroup(string inputGroup)
        {
            return (inputGroup ?? "").Replace(">", "").Trim();
        }

        private static bool ContainsWord(string text, string keyword)
        {
            return Regex.IsMatch(text ?? "", $@"\b{Regex.Escape(keyword)}", RegexOptions.IgnoreCase);
        }
    }
}
