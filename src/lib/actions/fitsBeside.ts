// Says whether a badge's full text fits beside the name on one line (e.g. "Moves up in 1y 8m" beside a
// long name), so the page can show its short form ("1y 8m") rather than let it wrap. Measured with hidden
// copies at their natural width, again whenever the line changes size.

export interface FitsBesideOptions {
	/** The badge's full text */
	full: string;
	/** Told whether it fits */
	onfit: (fits: boolean) => void;
}

const GAP = 8;

export function fitsBeside(line: HTMLElement, options: FitsBesideOptions) {
	let current = options;

	const natural = (el: Element, text?: string) => {
		const copy = el.cloneNode(true) as HTMLElement;
		if (text !== undefined) copy.textContent = text;
		Object.assign(copy.style, {
			position: 'absolute',
			visibility: 'hidden',
			width: 'max-content',
			flexWrap: 'nowrap',
			whiteSpace: 'nowrap'
		});
		line.appendChild(copy);
		const width = copy.getBoundingClientRect().width;
		copy.remove();
		return width;
	};

	const measure = () => {
		const name = line.querySelector('.name');
		const badge = line.querySelector('.move-up');
		if (!name || !badge || !current.full) return;
		const fits = natural(name) + GAP + natural(badge, current.full) <= line.clientWidth;
		current.onfit(fits);
	};

	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
	observer?.observe(line);
	measure();
	return {
		update(next: FitsBesideOptions) {
			current = next;
			measure();
		},
		destroy() {
			observer?.disconnect();
		}
	};
}
