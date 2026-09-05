/**
 * Hands the room's client to everything under `/room`.
 *
 * The connection is opened in an effect rather than a route loader on purpose:
 * `WebSocket` is a browser API, and this app server-renders, so loaders run
 * where it does not exist. An effect also gives the socket the one thing a
 * loader cannot — an unmount to close on.
 *
 * Nothing about the game is decided here. The client is built once and the
 * hooks below are windows onto its stores, so a component subscribes to the one
 * slice it draws and re-renders for nothing else.
 */

import { createContext, useContext, useEffect, useRef } from "react";

import { useStore } from "#/lib/net/store.ts";
import type { RoomClient } from "#/lib/room/client.ts";
import { createRoomClient } from "#/lib/room/client.ts";
import { wordSlots } from "#/lib/room/round-store.ts";

export type { RoomStatus } from "#/lib/room/client.ts";

const RoomContext = createContext<RoomClient | null>(null);

function useClient() {
	const client = useContext(RoomContext);
	if (!client) throw new Error("useRoom must be called inside <RoomProvider>");
	return client;
}

export function RoomProvider({
	code,
	children,
}: {
	code: string;
	children: React.ReactNode;
}) {
	// Built during render, not in the effect: the stores have to exist before
	// the children that read them do. It is inert until `connect` is called.
	const clientRef = useRef<RoomClient | null>(null);
	if (!clientRef.current) clientRef.current = createRoomClient(code);
	const client = clientRef.current;

	useEffect(() => client.connect(), [client]);

	return <RoomContext.Provider value={client}>{children}</RoomContext.Provider>;
}

/** The connection itself: are we in, who are we, and what went wrong. */
export function useRoom() {
	const client = useClient();
	const connection = useStore(client.connection);
	return { code: client.code, ...connection, retry: client.retry };
}

/** The roster, in join order. Sort it for display; the order fixes the colours. */
export function usePlayers() {
	return useStore(useClient().players.state);
}

/** The guess feed, oldest first, and the way to add to it. */
export function useChat() {
	const client = useClient();
	return { entries: useStore(client.chat.state), guess: client.chat.guess };
}

/**
 * The turn, the word as `WordHint` wants it, the host's start and the drawer's
 * pick.
 */
export function useTurn() {
	const client = useClient();
	const turn = useStore(client.round.state);
	return {
		...turn,
		slots: wordSlots(turn),
		start: client.round.start,
		pick: client.round.pick,
	};
}

/**
 * How the room is set up to play, and the host's way of changing it. Everyone
 * reads it — the lobby shows the whole room what is coming — and the server is
 * what decides whether a change from this player counts.
 */
export function useSettings() {
	const client = useClient();
	return {
		settings: useStore(client.settings.state),
		update: client.settings.update,
	};
}

/**
 * The board's channel. Deliberately not a store: it is a stable object whose
 * strokes never pass through React at all.
 */
export function useCanvas() {
	return useClient().canvas;
}
