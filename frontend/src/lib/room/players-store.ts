/**
 * The scoreboard. The server is the only authority on it, so this store never
 * edits a player — it swaps the whole roster for whatever last arrived.
 *
 * The order is the server's, which is join order, and it is left alone: the
 * player colours are handed out by position, and a list sorted by score would
 * change everyone's colour every time someone guessed.
 */

import type { Dispatcher } from "#/lib/net/dispatch.ts";
import type { Store } from "#/lib/net/store.ts";
import { createStore } from "#/lib/net/store.ts";
import type { ServerMessage, WirePlayer } from "#/lib/room/protocol.ts";
import type { Player } from "#/lib/room/types.ts";

export type PlayersStore = { state: Store<Player[]> };

export function createPlayersStore(
	dispatcher: Dispatcher<ServerMessage>,
): PlayersStore {
	const state = createStore<Player[]>([]);

	/** Who we are. Not known until the join is acknowledged. */
	let selfId: string | null = null;
	/** Kept so the roster can be re-marked if we learn our id after it arrives. */
	let roster: WirePlayer[] = [];

	function publish(players: WirePlayer[]) {
		roster = players;
		state.set(
			players.map((player) => ({ ...player, self: player.id === selfId })),
		);
	}

	dispatcher.on("joined", (message) => {
		if (selfId === message.playerId) return;
		selfId = message.playerId;
		publish(roster);
	});

	dispatcher.on("room", (message) => publish(message.players));
	dispatcher.on("players", (message) => publish(message.players));

	return { state };
}
