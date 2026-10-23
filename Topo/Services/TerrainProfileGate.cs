namespace Topo.Services
{
    // Terrain's "assume profile" switches the whole login to a youth's profile until it is revoked, so any
    // other request sent meanwhile would be answered as that youth. Requests normally run side by side,
    // but a span acting as a youth waits for them to finish and holds new ones back until it is done.
    // This matters once loading runs in the background while a leader uses another page.
    public class TerrainProfileGate
    {
        private readonly SemaphoreSlim _turn = new SemaphoreSlim(1, 1);
        private int _requestsInFlight;
        private TaskCompletionSource? _requestsDone;

        // Requests made from inside an acting-as-youth span belong to it and go straight through
        private static readonly AsyncLocal<bool> _actingAsYouth = new AsyncLocal<bool>();

        // Wrap every request to Terrain in this
        public async Task<IDisposable> Request()
        {
            if (_actingAsYouth.Value)
                return new Releaser(() => { });
            await _turn.WaitAsync();
            _requestsInFlight++;
            _turn.Release();
            return new Releaser(() =>
            {
                _requestsInFlight--;
                if (_requestsInFlight == 0)
                    _requestsDone?.TrySetResult();
            });
        }

        // Wrap everything from assuming a youth's profile to revoking it in this.
        // Not async, so the flag it sets stays with the caller's own requests.
        public Task<IDisposable> ActAsYouth()
        {
            _actingAsYouth.Value = true;
            return WaitForTurn();
        }

        private async Task<IDisposable> WaitForTurn()
        {
            await _turn.WaitAsync();
            while (_requestsInFlight > 0)
            {
                _requestsDone = new TaskCompletionSource();
                await _requestsDone.Task;
            }
            return new Releaser(() =>
            {
                _actingAsYouth.Value = false;
                _turn.Release();
            });
        }

        private sealed class Releaser : IDisposable
        {
            private Action? _release;

            public Releaser(Action release)
            {
                _release = release;
            }

            public void Dispose()
            {
                _release?.Invoke();
                _release = null;
            }
        }
    }
}
