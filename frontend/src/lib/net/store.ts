/**
 * The smallest thing that holds state React will re-render for.
 *
 * Room state is written from socket callbacks, not from a render, so it lives
 * outside the component tree and is read back through `useSyncExternalStore`.
 * One store holds one value: keeping chat, players and the round apart is what
 * stops a guess arriving from re-rendering the scoreboard.
 */

import { useSyncExternalStore } from "react";

export type Store<T> = {
	get: () => T;
	set: (next: T | ((current: T) => T)) => void;
	subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
	let value = initial;
	const listeners = new Set<() => void>();

	return {
		get: () => value,

		set(next) {
			const resolved =
				typeof next === "function" ? (next as (current: T) => T)(value) : next;
			// `useSyncExternalStore` re-renders on every notification, so a write
			// that changes nothing has to stop here rather than at the component.
			if (Object.is(resolved, value)) return;
			value = resolved;
			// Copied first: a listener is allowed to unsubscribe itself.
			for (const listener of [...listeners]) listener();
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/** Read a store from a component. */
export function useStore<T>(store: Store<T>): T {
	return useSyncExternalStore(store.subscribe, store.get, store.get);
}
