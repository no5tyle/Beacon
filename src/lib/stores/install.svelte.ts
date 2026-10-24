// Whether Beacon can be installed to the Home Screen, and the browser's install prompt when it offers one.
// Imported by the layout so the prompt is caught as soon as the browser sends it.

interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'none';

const INSTALLED_KEY = 'beacon-installed';
const DISMISSED_KEY = 'beacon-install-hint-dismissed';

const safeGet = (key: string) => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};
const safeSet = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Not remembered
	}
};

class Install {
	private promptEvent = $state<InstallPromptEvent | null>(null);
	private justInstalled = $state(false);
	dismissed = $state(false);

	constructor() {
		if (typeof window === 'undefined') return;
		this.justInstalled = safeGet(INSTALLED_KEY) === 'true';
		this.dismissed = safeGet(DISMISSED_KEY) === 'true';
		window.addEventListener('beforeinstallprompt', (event) => {
			event.preventDefault();
			this.promptEvent = event as InstallPromptEvent;
		});
		window.addEventListener('appinstalled', () => {
			this.promptEvent = null;
			this.justInstalled = true;
			safeSet(INSTALLED_KEY, 'true');
		});
	}

	/** Open as the installed app rather than in a browser tab */
	get isInstalledApp(): boolean {
		if (typeof window === 'undefined') return false;
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true
		);
	}

	get state(): InstallState {
		if (this.isInstalledApp || (this.justInstalled && !this.promptEvent)) return 'installed';
		if (this.promptEvent) return 'prompt';
		const ios =
			/iPad|iPhone|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		return ios ? 'ios' : 'none';
	}

	/** Shows the browser's install prompt */
	async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
		const event = this.promptEvent;
		if (!event) return 'unavailable';
		this.promptEvent = null;
		await event.prompt();
		const choice = await event.userChoice;
		if (choice.outcome === 'dismissed' && this.state === 'none') this.dismiss();
		return choice.outcome;
	}

	dismiss(): void {
		this.dismissed = true;
		safeSet(DISMISSED_KEY, 'true');
	}
}

export const install = new Install();
