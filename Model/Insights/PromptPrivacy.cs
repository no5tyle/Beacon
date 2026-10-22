using System.Text.RegularExpressions;

namespace Topo.Model.Insights
{
    // Keeps youth names out of AI prompts: names become initials, including any typed into leader notes.
    public static class PromptPrivacy
    {
        // "Zimo Gu" -> "Z.G.", "Hannah (Hai Yun) Wang" -> "H.W.", "Mary-Jane O'Neil" -> "M.O."
        public static string Initials(string firstName, string lastName = "")
        {
            var full = Regex.Replace($"{firstName} {lastName}", @"\([^)]*\)", " ");
            var letters = full
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(word => word.FirstOrDefault(char.IsLetter))
                .Where(c => c != default(char))
                .Select(c => char.ToUpperInvariant(c));
            var initials = string.Join(".", letters);
            return initials.Length == 0 ? "" : initials + ".";
        }

        // Replaces each youth's full name, then their individual first and last names, with their initials.
        // Single names are matched case sensitively as whole words so ordinary words are left alone.
        public static string ScrubNames(string text, IEnumerable<string> fullNames)
        {
            if (string.IsNullOrWhiteSpace(text))
                return text ?? "";

            var names = fullNames
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n.Trim())
                .Distinct()
                .OrderByDescending(n => n.Length)
                .ToList();

            foreach (var name in names)
                text = Regex.Replace(text, $@"\b{Regex.Escape(name)}\b", InitialsOf(name), RegexOptions.IgnoreCase);

            foreach (var name in names)
            {
                var initials = InitialsOf(name);
                foreach (var part in Regex.Replace(name, @"[()]", " ").Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(p => p.Length >= 3))
                    text = Regex.Replace(text, $@"\b{Regex.Escape(part)}\b", initials);
            }
            return text;
        }

        private static string InitialsOf(string fullName)
        {
            var parts = fullName.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            return Initials(parts[0], parts.Length > 1 ? parts[1] : "");
        }
    }
}
