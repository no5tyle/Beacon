// Pull down from the top of a page to refresh it, as in most phone apps: use:pullToRefresh={refresh}.
// A circle follows the finger down and spins until the refresh finishes.

import { icons } from '#lib/icons.js';

const THRESHOLD = 70;
const MAX_PULL = 110;

export function pullToRefresh(_node: HTMLElement, refresh: () => Promise<unknown> | unknown) {
	let onRefresh = refresh;
	const indicator = document.createElement('div');
	indicator.className = 'pull-indicator';
	indicator.setAttribute('aria-hidden', 'true');
	indicator.innerHTML = `<svg viewBox="0 0 800 800" width="1em" height="1em"><path fill="currentColor" transform="matrix(1 0 0 -1 0 800)" d="${icons.reload}"/></svg>`;
	document.body.appendChild(indicator);
	let startY: number | null = null;
	let pull = 0;
	let busy = false;

	const show = (distance: number) => {
		indicator.style.transform = `translate(-50%, ${distance - 48}px) rotate(${distance * 3}deg)`;
		indicator.style.opacity = String(Math.min(distance / THRESHOLD, 1));
		indicator.classList.toggle('ready', distance >= THRESHOLD);
	};
	const reset = () => {
		indicator.classList.remove('ready', 'spinning');
		indicator.style.transition = 'transform .2s, opacity .2s';
		show(0);
		setTimeout(() => (indicator.style.transition = ''), 200);
	};
	const onStart = (e: TouchEvent) => {
		// Only from the very top, with one finger, and not while a menu is open
		if (
			busy ||
			window.scrollY > 0 ||
			e.touches.length !== 1 ||
			document.querySelector('.more-menu')
		)
			return;
		startY = e.touches[0].clientY;
		pull = 0;
	};
	const onMove = (e: TouchEvent) => {
		if (startY === null) return;
		const distance = e.touches[0].clientY - startY;
		if (distance <= 0 || window.scrollY > 0) {
			if (pull > 0) reset();
			if (distance < 0) startY = null;
			pull = 0;
			return;
		}
		// Resist the pull the further it goes
		pull = Math.min(MAX_PULL, distance * 0.5);
		show(pull);
		if (e.cancelable) e.preventDefault();
	};
	const onEnd = async () => {
		if (startY === null) return;
		startY = null;
		if (pull < THRESHOLD) {
			reset();
			return;
		}
		busy = true;
		indicator.classList.add('spinning');
		show(THRESHOLD);
		try {
			await onRefresh();
		} catch (error) {
			console.error(error);
		}
		busy = false;
		reset();
	};

	window.addEventListener('touchstart', onStart, { passive: true });
	window.addEventListener('touchmove', onMove, { passive: false });
	window.addEventListener('touchend', onEnd);
	window.addEventListener('touchcancel', onEnd);
	return {
		update(next: () => Promise<unknown> | unknown) {
			onRefresh = next;
		},
		destroy() {
			window.removeEventListener('touchstart', onStart);
			window.removeEventListener('touchmove', onMove);
			window.removeEventListener('touchend', onEnd);
			window.removeEventListener('touchcancel', onEnd);
			indicator.remove();
		}
	};
}
