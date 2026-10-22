using System.Globalization;
using System.Text.Json.Nodes;

namespace Topo.Model.OAS
{
    // Builds the request bodies Terrain's own web app sends when a leader records OAS "I" statements
    // on a youth member's behalf. Existing answers are never removed or changed, only added to.
    public static class OASRecording
    {
        public const string AchievementType = "outdoor_adventure_skill";
        public const string VerifiableCheckbox = "verifiable_checkbox";
        public const string LogbookInputId = "logbook_up_to_date";
        public const string VerifierTypeMember = "member";
        public const string SubmitTypeReview = "review";

        // Adult leaders can't verify Stage 6 and above (Terrain's verifier dialog)
        public const int MaxLeaderVerifiableStage = 5;

        private const string VerifiedDateSuffix = "_verifiedDate";
        private const string VerifierNameSuffix = "_verifierName";
        private const string VerifierTypeSuffix = "_verifierType";
        private const string VerifierContactSuffix = "_verifierContact";

        // Statuses where the youth (or a leader on their behalf) can still change answers
        private static readonly string[] EditableStatuses = { "in_progress", "draft_review", "feedback_review" };

        public static bool IsEditable(string? status)
        {
            return string.IsNullOrEmpty(status) || EditableStatuses.Contains(status);
        }

        public static List<OASStatement> Statements(GetOASTemplateResultModel template, JsonObject? answers)
        {
            var statements = new List<OASStatement>();
            foreach (var document in template.document)
            {
                foreach (var group in document.input_groups)
                {
                    foreach (var input in group.inputs.Where(i => i.type == VerifiableCheckbox || i.id == LogbookInputId))
                    {
                        statements.Add(new OASStatement
                        {
                            InputId = input.id,
                            Group = group.title.Replace(">", "").Trim(),
                            Label = input.label,
                            IsLogbook = input.id == LogbookInputId,
                            AlreadyDone = IsTrue(answers?[input.id]),
                            VerifiedBy = answers?[input.id + VerifierNameSuffix]?.ToString() ?? "",
                            VerifiedDate = answers?[input.id + VerifiedDateSuffix]?.ToString() ?? ""
                        });
                    }
                }
            }
            return statements;
        }

        // Answers for the save: a copy of the existing answers plus each newly ticked statement
        public static JsonObject AddVerifications(JsonObject? existingAnswers, IEnumerable<OASStatement> newlyTicked, OASVerifier verifier, DateTime verifiedOn)
        {
            var answers = existingAnswers == null ? new JsonObject() : (JsonObject)existingAnswers.DeepClone();
            foreach (var statement in newlyTicked.Where(s => !s.AlreadyDone))
            {
                answers[statement.InputId] = true;
                if (statement.IsLogbook)
                    continue;
                answers[statement.InputId + VerifierTypeSuffix] = verifier.Type;
                answers[statement.InputId + VerifierNameSuffix] = verifier.Name;
                answers[statement.InputId + VerifierContactSuffix] = verifier.Contact;
                answers[statement.InputId + VerifiedDateSuffix] = verifiedOn.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }
            return answers;
        }

        // Body for POST members/{id}/achievements when the youth hasn't started this stage
        public static JsonObject CreateBody(GetOASTemplateResultModel template, OASStageListModel stage, string section, JsonObject answers)
        {
            return new JsonObject
            {
                ["achievement_meta"] = Meta(stage),
                ["achievement_type"] = AchievementType,
                ["template"] = template.template,
                ["version"] = template.version,
                ["section"] = section,
                ["answers"] = answers,
                ["uploads"] = new JsonArray()
            };
        }

        // Body for PUT members/{id}/achievements/{achievementId}, keeping the record's own template,
        // version, section, uploads and last_updated so nothing else on it changes
        public static JsonObject UpdateBody(JsonObject existing, JsonObject answers)
        {
            return new JsonObject
            {
                ["achievement_meta"] = existing["achievement_meta"]?.DeepClone(),
                ["achievement_type"] = AchievementType,
                ["template"] = existing["template"]?.DeepClone(),
                ["version"] = existing["version"]?.DeepClone(),
                ["section"] = existing["section"]?.DeepClone(),
                ["answers"] = answers,
                ["uploads"] = existing["uploads"]?.DeepClone() ?? new JsonArray(),
                ["last_updated"] = existing["last_updated"]?.DeepClone()
            };
        }

        public static JsonObject SubmitBody(string unitId, string submittedByMemberId)
        {
            return new JsonObject
            {
                ["type"] = SubmitTypeReview,
                ["unit_id"] = unitId,
                ["submitted_by"] = submittedByMemberId
            };
        }

        public static bool AllComplete(IEnumerable<OASStatement> statements)
        {
            return statements.All(s => s.AlreadyDone);
        }

        // Terrain only lets Stages 4+ earn credit once the stage three below is complete in the same stream
        public static bool CanReceiveCredit(int stage, IEnumerable<int> completedStagesInStream)
        {
            return stage <= 3 || completedStagesInStream.Contains(stage - 3);
        }

        public static bool IsPreviousStageComplete(int stage, IEnumerable<int> completedStagesInStream)
        {
            return stage == 1 || completedStagesInStream.Contains(stage - 1);
        }

        private static JsonObject Meta(OASStageListModel stage)
        {
            return new JsonObject
            {
                ["stage"] = stage.Stage,
                ["stream"] = stage.Stream.ToLowerInvariant(),
                ["branch"] = stage.Branch
            };
        }

        private static bool IsTrue(JsonNode? node)
        {
            if (node == null)
                return false;
            if (node is JsonValue value)
            {
                if (value.TryGetValue<bool>(out var b))
                    return b;
                if (value.TryGetValue<string>(out var s))
                    return s.Equals("true", StringComparison.OrdinalIgnoreCase);
            }
            return false;
        }
    }

    public class OASStatement
    {
        public string InputId { get; set; } = string.Empty;
        public string Group { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public bool IsLogbook { get; set; }
        public bool AlreadyDone { get; set; }
        public string VerifiedBy { get; set; } = string.Empty;
        public string VerifiedDate { get; set; } = string.Empty;
    }

    public class OASVerifier
    {
        public string Type { get; set; } = OASRecording.VerifierTypeMember;
        public string Name { get; set; } = string.Empty;
        public string Contact { get; set; } = string.Empty;
    }

    public class TerrainWriteResult
    {
        public bool Success { get; set; }
        public int StatusCode { get; set; }
        public string Body { get; set; } = string.Empty;
    }
}
