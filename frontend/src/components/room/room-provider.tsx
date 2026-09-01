/**
 * Owns the room's websocket and hands its state to everything under `/room`.
 *
 * The connection is opened in an effect rather than a route loader on purpose:
 * `WebSocket` is a browser API, and this app server-renders, so loaders run
 * where it does not exist. An effect also gives the socket the one thing a
 * loader cannot — an unmount to close on.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { SOCKET_URL } from "#/lib/api.ts";
import { joinAckSchema } from "#/lib/schemas.ts";
import { claimedId, playerName } from "#/lib/storage.ts";

export type RoomStatus =
	/** Socket opening. */
	| "connecting"
	/** Open, waiting for the server to acknowledge the join message. */
	| "joining"
	/** In the room. */
	| "joined"
	/** Gone, either because the server closed us or the network dropped. */
	| "closed";

type RoomValue = {
	code: string;
	status: RoomStatus;
	/** Assigned by the server on join; `null` until then. */
	playerId: string | null;
	owner: boolean;
	/** The server's reason for closing, when it gave one. */
	error: string | null;
	/** Open a fresh socket after a drop. */
	retry: () => void;
	send: (message: unknown) => void;
};

const RoomContext = createContext<RoomValue | null>(null);

export function useRoom() {
	const room = useContext(RoomContext);
	if (!room) throw new Error("useRoom must be called inside <RoomProvider>");
	return room;
}

/** Normal closure. Anything else means the room ended without us asking. */
const CLOSE_NORMAL = 1000;

export function RoomProvider({
	code,
	children,
}: {
	code: string;
	children: React.ReactNode;
}) {
	const [status, setStatus] = useState<RoomStatus>("connecting");
	const [playerId, setPlayerId] = useState<string | null>(null);
	const [owner, setOwner] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	const socketRef = useRef<WebSocket | null>(null);

	// `attempt` is never read below: bumping it is what re-runs this effect and
	// opens a fresh socket after a drop.
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry trigger
	useEffect(() => {
		const socket = new WebSocket(SOCKET_URL);
		socketRef.current = socket;

		// Cleanup runs before the close event lands, and in development the
		// effect is mounted twice; this keeps the torn-down socket from writing
		// its close over the state of the one that replaced it.
		let live = true;
		let joined = false;

		setStatus("connecting");
		setError(null);

		socket.addEventListener("open", () => {
			if (!live) return;
			setStatus("joining");
			// The join has to be the first message: the server reads exactly one
			// and closes the socket if it does not arrive.
			socket.send(
				JSON.stringify({
					code,
					username: playerName(),
					// Only the tab that created this lobby has an id to claim.
					// Everyone else is assigned one by the server.
					playerId: claimedId(code) ?? undefined,
				}),
			);
		});

		socket.addEventListener("message", (event) => {
			if (!live) return;

			if (!joined) {
				const ack = joinAckSchema.safeParse(safeJson(event.data));
				if (!ack.success) {
					setError("The server sent something we did not understand.");
					socket.close(CLOSE_NORMAL, "bad ack");
					return;
				}
				joined = true;
				setPlayerId(ack.data.playerId);
				setOwner(ack.data.owner);
				setStatus("joined");
				return;
			}

			// TODO: route game messages here once the protocol lands.
		});

		socket.addEventListener("close", (event) => {
			if (!live) return;
			setStatus("closed");
			// `reason` carries the server's close message ("no such room" and
			// friends). A drop mid-game has no reason at all.
			setError(
				event.reason ||
					(event.code === CLOSE_NORMAL
						? "You left the room."
						: "The connection dropped."),
			);
		});

		return () => {
			live = false;
			socketRef.current = null;
			socket.close(CLOSE_NORMAL, "leaving");
		};
	}, [code, attempt]);

	const send = useCallback((message: unknown) => {
		const socket = socketRef.current;
		if (socket?.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify(message));
	}, []);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);

	const value = useMemo(
		() => ({ code, status, playerId, owner, error, retry, send }),
		[code, status, playerId, owner, error, retry, send],
	);

	return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

function safeJson(data: unknown) {
	if (typeof data !== "string") return null;
	try {
		return JSON.parse(data);
	} catch {
		return null;
	}
}
