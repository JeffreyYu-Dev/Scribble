/**
 * The connection, and nothing about the game.
 *
 * This layer owns three things: the socket itself, getting it back after a
 * drop, and the queue of messages written while it was away. What those
 * messages mean is somebody else's problem — frames go out as JSON and come
 * back as parsed values, and the room's protocol lives a layer up.
 */

export type SocketStatus =
	/** First attempt, nothing has connected yet. */
	| "connecting"
	/** Live. */
	| "open"
	/** Dropped, waiting on a backoff before trying again. */
	| "reconnecting"
	/** Given up, or the server sent us away. */
	| "closed";

export type CloseDetail = { code: number; reason: string };

type SocketOptions = {
	url: string;
	/**
	 * Sent first on every open, ahead of anything queued. The room uses it to
	 * re-identify itself after a reconnect, which the server requires before it
	 * will accept anything else.
	 */
	handshake?: () => unknown;
	onMessage: (raw: unknown) => void;
	onStatus: (status: SocketStatus, close: CloseDetail | null) => void;
};

export type Socket = {
	send: (message: unknown) => void;
	/** Open a fresh socket after the retries ran out. */
	retry: () => void;
	close: () => void;
};

/** Normal closure: we left, or the server finished with us on purpose. */
const CLOSE_NORMAL = 1000;
/** The server refused us — "no such room" and friends. Retrying cannot help. */
const CLOSE_POLICY = 1008;

const MAX_ATTEMPTS = 6;
const BASE_DELAY = 500;
const MAX_DELAY = 8_000;

/**
 * How many messages may wait on a closed socket. Anything beyond this is a
 * client drawing into a void: the oldest are dropped, because the newest are
 * the ones still worth arriving.
 */
const QUEUE_LIMIT = 64;

export function createSocket({
	url,
	handshake,
	onMessage,
	onStatus,
}: SocketOptions): Socket {
	let socket: WebSocket | null = null;
	let queue: unknown[] = [];
	let attempts = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

	function open() {
		if (disposed) return;
		timer = null;
		onStatus(attempts === 0 ? "connecting" : "reconnecting", null);

		const next = new WebSocket(url);
		socket = next;

		// Every handler checks that it still belongs to the live socket: a
		// replaced connection goes on firing events for a moment, and its close
		// must not be mistaken for the current one's.
		next.addEventListener("open", () => {
			if (disposed || socket !== next) return;
			attempts = 0;
			if (handshake) next.send(JSON.stringify(handshake()));
			const pending = queue;
			queue = [];
			for (const message of pending) next.send(JSON.stringify(message));
			onStatus("open", null);
		});

		next.addEventListener("message", (event) => {
			if (disposed || socket !== next) return;
			onMessage(decode(event.data));
		});

		next.addEventListener("close", (event) => {
			if (disposed || socket !== next) return;
			socket = null;

			// A room that does not exist will not exist a second later either,
			// and a clean close was somebody's decision. Only a connection that
			// fell over is worth another try.
			const retriable =
				event.code !== CLOSE_NORMAL && event.code !== CLOSE_POLICY;

			if (retriable && attempts < MAX_ATTEMPTS) {
				attempts++;
				onStatus("reconnecting", null);
				timer = setTimeout(open, backoff(attempts));
				return;
			}

			queue = [];
			onStatus("closed", { code: event.code, reason: event.reason });
		});
	}

	open();

	return {
		send(message) {
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify(message));
				return;
			}
			if (queue.length >= QUEUE_LIMIT) queue.shift();
			queue.push(message);
		},

		retry() {
			if (disposed) return;
			if (timer) clearTimeout(timer);
			socket?.close(CLOSE_NORMAL, "retrying");
			socket = null;
			attempts = 0;
			open();
		},

		close() {
			disposed = true;
			if (timer) clearTimeout(timer);
			timer = null;
			queue = [];
			socket?.close(CLOSE_NORMAL, "leaving");
			socket = null;
		},
	};
}

/** Exponential, with jitter so a server restart is not met by a thundering herd. */
function backoff(attempt: number) {
	const ceiling = Math.min(MAX_DELAY, BASE_DELAY * 2 ** (attempt - 1));
	return ceiling / 2 + Math.random() * (ceiling / 2);
}

function decode(data: unknown): unknown {
	if (typeof data !== "string") return null;
	try {
		return JSON.parse(data);
	} catch {
		return null;
	}
}
