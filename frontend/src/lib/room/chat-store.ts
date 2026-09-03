/**
 * The guess feed: a capped list of entries, appended to as they arrive.
 *
 * Guesses are not echoed optimistically. The server decides whether a guess is
 * a miss, a near miss or the word itself, and showing it as an ordinary miss
 * first would flash the wrong answer at the one player who got it right.
 */

import type { Dispatcher } from "#/lib/net/dispatch.ts";
import type { Store } from "#/lib/net/store.ts";
import { createStore } from "#/lib/net/store.ts";
import type {
	ClientMessage,
	ServerMessage,
	WireChatEntry,
} from "#/lib/room/protocol.ts";
import type { ChatEntry } from "#/lib/room/types.ts";

/** How many lines of history the panel keeps. Older ones are dropped. */
const MAX_ENTRIES = 200;

export type ChatStore = {
	state: Store<ChatEntry[]>;
	guess: (text: string) => void;
};

export function createChatStore(
	dispatcher: Dispatcher<ServerMessage>,
	send: (message: ClientMessage) => void,
): ChatStore {
	const state = createStore<ChatEntry[]>([]);

	let selfId: string | null = null;

	dispatcher.on("joined", (message) => {
		selfId = message.playerId;
	});

	dispatcher.on("room", (message) => {
		state.set(message.chat.map((entry) => toEntry(entry, selfId)));
	});

	dispatcher.on("chat", (message) => {
		const entry = toEntry(message.entry, selfId);
		state.set((current) => [...current, entry].slice(-MAX_ENTRIES));
	});

	return {
		state,
		guess(text) {
			send({ type: "guess", text });
		},
	};
}

/**
 * Wire entry to feed entry: drop the id the panel has no use for, and mark our
 * own guesses so they render on the near side of the thread.
 */
function toEntry(entry: WireChatEntry, selfId: string | null): ChatEntry {
	switch (entry.kind) {
		case "guess":
			return {
				id: entry.id,
				kind: "guess",
				player: entry.player,
				text: entry.text,
				self: entry.playerId === selfId,
				scope: entry.scope,
			};
		case "correct":
			return {
				id: entry.id,
				kind: "correct",
				player: entry.player,
				self: entry.playerId === selfId,
			};
		case "close":
			return { id: entry.id, kind: "close", text: entry.text };
		default:
			return { id: entry.id, kind: entry.kind, player: entry.player };
	}
}
