// Marks a sideways-scrolling element with whether there's more to see either side, so CSS can fade that
// edge (see .scroll-hint in base.css): otherwise a cut off table or row of chips looks complete.

export function scrollHint(node: HTMLElement) {
	const update = () => {
		const more = node.scrollWidth - node.clientWidth;
		node.toggleAttribute('data-more-left', node.scrollLeft > 2);
		node.toggleAttribute('data-more-right', more - node.scrollLeft > 2);
	};
	node.classList.add('scroll-hint');
	node.addEventListener('scroll', update, { passive: true });
	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
	observer?.observe(node);
	// Content can change size without the element doing so, e.g. a stream's stages replacing another's
	const mutations =
		typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => update());
	mutations?.observe(node, { childList: true, subtree: true });
	update();
	return {
		destroy() {
			node.removeEventListener('scroll', update);
			observer?.disconnect();
			mutations?.disconnect();
		}
	};
}
