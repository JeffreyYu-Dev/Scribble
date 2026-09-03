/**
 * The room, assembled: one socket, one dispatcher, and the stores that read
 * from it.
 *
 * Everything here is plain objects — no React — so the wiring can be read in
 * one sitting and the provider above it is only a way of getting hold of this.
 * The layers stack in one direction: the transport knows about frames, the
 * dispatcher about types, the stores about the game, and the components about
 * none of the three.
 */

import { env } from "#/lib/env.ts";
import type { Dispatcher } from "#/lib/net/dispatch.ts";
import { createDispatcher } from "#/lib/net/dispatch.ts";
import type { CloseDetail, Socket, SocketStatus } from "#/lib/net/socket.ts";
import { createSocket } from "#/lib/net/socket.ts";
import type { Store } from "#/lib/net/store.ts";
import { createStore } from "#/lib/net/store.ts";
import type { CanvasBus } from "#/lib/room/canvas-bus.ts";
import { createCanvasBus } from "#/lib/room/canvas-bus.ts";
import type { ChatStore } from "#/lib/room/chat-store.ts";
import { createChatStore } from "#/lib/room/chat-store.ts";
import type { PlayersStore } from "#/lib/room/players-store.ts";
import { createPlayersStore } from "#/lib/room/players-store.ts";
import type { ClientMessage, ServerMessage } from "#/lib/room/protocol.ts";
import { parseServerMessage } from "#/lib/room/protocol.ts";
import type { RoundStore } from "#/lib/room/round-store.ts";
import { createRoundStore } from "#/lib/room/round-store.ts";
import { claimedId, playerName } from "#/lib/storage.ts";

export type RoomStatus =
	/** Socket opening. */
	| "connecting"
	/** Open, waiting for the server to acknowledge the join. */
	| "joining"
	/** In the room. */
	| "joined"
	/** Dropped, and trying to get back. */
	| "reconnecting"
	/** Gone for good. */
	| "closed";

export type Connection = {
	status: RoomStatus;
	/** Assigned by the server on join; `null` until then. */
	playerId: string | null;
	owner: boolean;
	/** Why we are not in the room, when there is a reason worth showing. */
	error: string | null;
};

export type RoomClient = {
	code: string;
	connection: Store<Connection>;
	players: PlayersStore;
	chat: ChatStore;
	round: RoundStore;
	canvas: CanvasBus;
	/** Opens the socket. Returns a teardown; safe to call again afterwards. */
	connect: () => () => void;
	/** Try again after the reconnects ran out. */
	retry: () => void;
};

export function createRoomClient(code: string): RoomClient {
	const connection = createStore<Connection>({
		status: "connecting",
		playerId: null,
		owner: false,
		error: null,
	});

	const dispatcher: Dispatcher<ServerMessage> = createDispatcher({
		parse: parseServerMessage,
	});

	// The socket only exists between `connect` and its teardown, so sends go
	// through this rather than a captured reference. Anything written while it
	// is away is queued by the transport.
	let socket: Socket | null = null;
	const send = (message: ClientMessage) => socket?.send(message);

	const players = createPlayersStore(dispatcher);
	const chat = createChatStore(dispatcher, send);
	const round = createRoundStore(dispatcher, send);
	const canvas = createCanvasBus(dispatcher, send);

	dispatcher.on("joined", (message) => {
		connection.set((current) => ({
			...current,
			status: "joined",
			playerId: message.playerId,
			owner: message.owner,
			error: null,
		}));
	});

	dispatcher.on("error", (message) => {
		connection.set((current) => ({ ...current, error: message.message }));
	});

	function onStatus(status: SocketStatus, close: CloseDetail | null) {
		connection.set((current) => ({
			...current,
			status: roomStatus(status),
			// An open socket is not a room yet, and a reconnect has to be
			// acknowledged again before it is.
			error: status === "closed" ? closeReason(close) : null,
		}));
	}

	return {
		code,
		connection,
		players,
		chat,
		round,
		canvas,

		connect() {
			socket = createSocket({
				url: env.SOCKET_URL,
				// Re-sent on every open, not just the first: the server reads a
				// join before it will accept anything else, so a reconnect has
				// to identify itself all over again.
				handshake: (): ClientMessage => ({
					type: "join",
					code,
					username: playerName(),
					// Only the tab that created this lobby has an id to claim.
					playerId: claimedId(code) ?? undefined,
				}),
				onMessage: dispatcher.deliver,
				onStatus,
			});

			return () => {
				socket?.close();
				socket = null;
				// Unsent strokes belong to a connection that no longer exists.
				canvas.reset();
			};
		},

		retry() {
			socket?.retry();
		},
	};
}

/** An open socket is only "joining" until the server says otherwise. */
function roomStatus(status: SocketStatus): RoomStatus {
	switch (status) {
		case "connecting":
			return "connecting";
		case "open":
			return "joining";
		case "reconnecting":
			return "reconnecting";
		case "closed":
			return "closed";
	}
}

/** The server's close message, or the best guess we can make from the code. */
function closeReason(close: CloseDetail | null) {
	if (close?.reason) return close.reason;
	if (close?.code === 1000) return "You left the room.";
	return "The connection dropped.";
}
