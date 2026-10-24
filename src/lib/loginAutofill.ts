// Logs in straight away when a password manager fills the member number and password. A fill is spotted
// by the browser marking the field :autofill (Safari and Chrome both do), or by the password arriving
// several characters at once rather than a keystroke at a time; the fields are also checked on a timer
// in case the fill fires no events. Tries once, so a failed login doesn't loop.

export interface AutofillFields {
	branch: HTMLSelectElement;
	member: HTMLInputElement;
	password: HTMLInputElement;
}

export interface AutofillOptions {
	/** Logs in; called at most once */
	onFilled: () => void;
	/** Notes what happened, for the troubleshooting panel: event names and lengths, never values */
	note?: (text: string) => void;
}

function isAutofilled(field: HTMLElement): boolean {
	for (const selector of [':autofill', ':-webkit-autofill']) {
		try {
			if (field.matches(selector)) return true;
		} catch {
			// Selector not supported by this browser
		}
	}
	return false;
}

export function watchLoginAutofill(
	fields: AutofillFields,
	{ onFilled, note = () => {} }: AutofillOptions
): () => void {
	const { branch, member, password } = fields;
	// Length of the password the last time it changed; a jump of several characters is a fill
	let lastLength = password.value.length;
	let jumped = false;
	let tried = false;
	const timers: ReturnType<typeof setTimeout>[] = [];

	const sawPassword = (source: string) => {
		const length = password.value.length;
		if (length - lastLength >= 3) jumped = true;
		if (length < lastLength || length - lastLength === 1) jumped = false;
		if (length !== lastLength)
			note(
				`${source} password ${lastLength}→${length}${isAutofilled(password) ? ' autofill' : ''}`
			);
		lastLength = length;
	};

	const check = (source: string) => {
		if (tried) return;
		sawPassword(source);
		if (!branch.value || !member.value || !password.value) return;
		if (!jumped && !isAutofilled(password)) return;
		tried = true;
		stop();
		note(`logging in (${isAutofilled(password) ? 'autofill' : 'filled at once'})`);
		onFilled();
	};

	const listeners: [HTMLElement, string, EventListener][] = [];
	const listen = (element: HTMLElement, type: string, listener: EventListener) => {
		element.addEventListener(type, listener);
		listeners.push([element, type, listener]);
	};
	for (const field of [member, password]) {
		for (const type of ['keydown', 'input', 'change']) {
			listen(field, type, (event) => {
				const e = event as KeyboardEvent & InputEvent;
				note(
					`${field.id} ${type}` +
						(e.key ? ` key=${e.key.length === 1 ? 'char' : e.key}` : '') +
						(e.inputType !== undefined ? ` inputType=${e.inputType || "''"}` : '') +
						(field === member ? ` length=${member.value.length}` : '')
				);
				if (field === password && type === 'input') sawPassword('input');
				if (type !== 'keydown') timers.push(setTimeout(() => check(type), 150));
			});
		}
	}
	// The branch isn't filled by password managers; picking it after the fill also logs in
	listen(branch, 'change', () => check('branch'));
	const interval = setInterval(() => check('timer'), 400);
	const giveUp = setTimeout(() => clearInterval(interval), 10 * 60 * 1000);
	note(`ready, branch ${branch.value ? 'set' : 'empty'}`);

	function stop() {
		clearInterval(interval);
		clearTimeout(giveUp);
		timers.forEach(clearTimeout);
		listeners.forEach(([element, type, listener]) => element.removeEventListener(type, listener));
	}
	return stop;
}
