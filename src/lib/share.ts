// Sharing and copying from the browser, e.g. a Reference statement's link.

/** Copies text to the clipboard, falling back to a hidden text box where the clipboard API isn't allowed */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const box = document.createElement('textarea');
		box.value = text;
		box.setAttribute('readonly', '');
		box.style.position = 'fixed';
		box.style.opacity = '0';
		document.body.appendChild(box);
		box.select();
		try {
			return document.execCommand('copy');
		} catch {
			return false;
		} finally {
			box.remove();
		}
	}
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Shares through the phone's share sheet, or copies where sharing isn't available */
export async function share(title: string, text: string, url: string): Promise<ShareResult> {
	if (navigator.share) {
		try {
			await navigator.share(url ? { title, text, url } : { title, text });
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		}
	}
	return (await copyText(url ? `${text}\n${url}` : text)) ? 'copied' : 'failed';
}
