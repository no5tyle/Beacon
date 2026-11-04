// "Keep me signed in": the one exception to Beacon keeping no login on the device, and only when the
// member ticks it. What's kept is Terrain's refresh token and which of Terrain's login apps it's for,
// never the password. It's encrypted with an AES key the browser generates as non-extractable, so not
// even Beacon's own code can read the key out, and both live in this site's IndexedDB. It's removed on
// Logout, when Terrain won't renew it, or when logging in without the box ticked.

export interface SavedLogin {
	clientId: string;
	refreshToken: string;
}

/** Set while a login is kept, so the app knows straight away, before IndexedDB answers, to wait for it */
const FLAG_KEY = 'beacon-keep-signed-in';
const DB_NAME = 'beacon-login';
const STORE = 'login';
const RECORD = 'saved';

interface Stored {
	key: CryptoKey;
	iv: Uint8Array<ArrayBuffer>;
	data: ArrayBuffer;
}

export function hasSavedLogin(): boolean {
	try {
		return globalThis.localStorage?.getItem(FLAG_KEY) === '1';
	} catch {
		return false;
	}
}

function setFlag(on: boolean): void {
	try {
		if (on) globalThis.localStorage?.setItem(FLAG_KEY, '1');
		else globalThis.localStorage?.removeItem(FLAG_KEY);
	} catch {
		// Without storage nothing is kept anyway
	}
}

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	use: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = use(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

/** Keeps the login on this device. Says false if the browser can't (e.g. a private window) */
export async function saveLogin(login: SavedLogin): Promise<boolean> {
	try {
		const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt'
		]);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const data = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			new TextEncoder().encode(JSON.stringify(login))
		);
		await withStore('readwrite', (store) => store.put({ key, iv, data } satisfies Stored, RECORD));
		setFlag(true);
		return true;
	} catch {
		await forgetLogin();
		return false;
	}
}

/** The kept login, or null when there's none or it can't be read */
export async function readSavedLogin(): Promise<SavedLogin | null> {
	if (!hasSavedLogin()) return null;
	try {
		const stored = (await withStore('readonly', (store) => store.get(RECORD))) as
			Stored | undefined;
		if (!stored) return null;
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: stored.iv },
			stored.key,
			stored.data
		);
		const login = JSON.parse(new TextDecoder().decode(plain)) as Partial<SavedLogin>;
		return typeof login.clientId === 'string' && typeof login.refreshToken === 'string'
			? { clientId: login.clientId, refreshToken: login.refreshToken }
			: null;
	} catch {
		return null;
	}
}

/** Removes the kept login from this device */
export async function forgetLogin(): Promise<void> {
	setFlag(false);
	try {
		await withStore('readwrite', (store) => store.delete(RECORD));
	} catch {
		// Nothing kept, or no storage
	}
}
