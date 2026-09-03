/**
 * Routes decoded messages to whoever asked for that type.
 *
 * This is the only layer that knows a message has a `type`, and it is the only
 * thing it knows: the transport below hands it raw frames, and the stores above
 * subscribe to the handful of types each of them cares about. Adding a message
 * to the protocol never touches this file.
 */

export type Tagged = { type: string };

export type Dispatcher<M extends Tagged> = {
	/** Feed a raw frame in. Anything that does not parse is dropped. */
	deliver: (raw: unknown) => void;
	/** Listen for one message type. Returns an unsubscribe. */
	on: <K extends M["type"]>(
		type: K,
		handler: (message: Extract<M, { type: K }>) => void,
	) => () => void;
};

export function createDispatcher<M extends Tagged>({
	parse,
	onUnknown,
}: {
	/** Turns a raw frame into a message, or `null` if it is not one of ours. */
	parse: (raw: unknown) => M | null;
	onUnknown?: (raw: unknown) => void;
}): Dispatcher<M> {
	const handlers = new Map<string, Set<(message: M) => void>>();

	return {
		deliver(raw) {
			const message = parse(raw);
			if (!message) {
				onUnknown?.(raw);
				return;
			}
			const listeners = handlers.get(message.type);
			if (!listeners) return;
			// Copied first: a handler is allowed to unsubscribe itself.
			for (const listener of [...listeners]) listener(message);
		},

		on(type, handler) {
			const listeners = handlers.get(type) ?? new Set<(message: M) => void>();
			handlers.set(type, listeners);

			// The cast is the one unsound step, and it is paid for by `deliver`:
			// a handler is only ever called with a message whose `type` is the
			// key it was filed under.
			const listener = handler as (message: M) => void;
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
	};
}
