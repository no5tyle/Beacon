// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** Short commit hash of the deployed build, or "dev" */
	const __BEACON_VERSION__: string;
}

export {};
