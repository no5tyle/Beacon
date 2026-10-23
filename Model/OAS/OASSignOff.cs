namespace Topo.Model.OAS
{
    // Signing off the same "I" statements for several youth at once, e.g. after a unit night activity
    public static class OASSignOff
    {
        // Where a youth stands for the chosen statements, from the unit's records for the stage
        public static YouthSignOff ForYouth(Result? record, IEnumerable<string> selectedInputIds)
        {
            var status = record?.status ?? "";
            if (!OASRecording.IsEditable(status))
                return new YouthSignOff { State = SignOffState.Locked, Status = status };

            var toAdd = selectedInputIds.Count(id => !IsDone(record, id));
            return new YouthSignOff
            {
                State = toAdd == 0 ? SignOffState.AlreadyDone : SignOffState.ToAdd,
                Status = status,
                ToAddCount = toAdd
            };
        }

        // The record to use for each youth: a completed one if there is one, otherwise the latest
        public static Dictionary<string, Result> LatestByMember(IEnumerable<Result> records, string branch)
        {
            return records
                .Where(r => string.IsNullOrEmpty(branch) || r.achievement_meta.branch == branch)
                .GroupBy(r => r.member_id)
                .ToDictionary(g => g.Key, g => g
                    .OrderByDescending(r => r.status == "awarded" || r.status == "approved")
                    .ThenByDescending(r => r.last_updated)
                    .First());
        }

        private static bool IsDone(Result? record, string inputId)
        {
            return record != null
                && record.answers.TryGetValue(inputId, out var value)
                && string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);
        }
    }

    public enum SignOffState
    {
        ToAdd,
        AlreadyDone,
        Locked
    }

    public class YouthSignOff
    {
        public SignOffState State { get; set; }
        public string Status { get; set; } = string.Empty;
        public int ToAddCount { get; set; }
    }

    public enum SignOffOutcomeState
    {
        Waiting,
        Saving,
        Saved,
        Skipped,
        Failed
    }

    public class SignOffOutcome
    {
        public SignOffOutcomeState State { get; set; } = SignOffOutcomeState.Waiting;
        public int SavedCount { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}
