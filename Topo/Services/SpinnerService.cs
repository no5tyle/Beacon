namespace Topo.Services
{
    public class SpinnerService
    {
        public event Action OnShow;
        public event Action OnHide;

        // Set by work running in the background, so its requests don't flash the spinner over the page in use
        public static readonly AsyncLocal<bool> Quiet = new AsyncLocal<bool>();

        public void Show()
        {
            if (Quiet.Value)
                return;
            OnShow?.Invoke();
        }

        public void Hide()
        {
            if (Quiet.Value)
                return;
            OnHide?.Invoke();
        }
    }
}
