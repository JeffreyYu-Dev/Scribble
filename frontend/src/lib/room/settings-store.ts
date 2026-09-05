/**
 * The room's configuration: what the next game will be played by.
 *
 * The server owns this, so the store is mostly a window onto what it last said.
 * The one exception is `update`, which writes the host's change locally before
 * the socket has been anywhere — a select that waits a round trip to move reads
 * as a broken select — and then lets the server's answer land on top. What
 * comes back is the sanitized version, so a value the room would not accept
 * corrects itself a moment after it is chosen rather than being silently
 * different from what the host is looking at.
 */

import type { Dispatcher } from "#/lib/net/dispatch.ts";
import type { Store } from "#/lib/net/store.ts";
import { createStore } from "#/lib/net/store.ts";
import type { ClientMessage, ServerMessage } from "#/lib/room/protocol.ts";
import type { GameSettings } from "#/lib/room/settings.ts";
import { DEFAULT_SETTINGS } from "#/lib/room/settings.ts";

export type SettingsStore = {
	state: Store<GameSettings>;
	/**
	 * Ask for a change. The server ignores anyone but the host, and anything at
	 * all once a game is running — so a guest calling this sees their own change
	 * for as long as it takes the room to say otherwise, which is not long.
	 */
	update: (settings: GameSettings) => void;
};

export function createSettingsStore(
	dispatcher: Dispatcher<ServerMessage>,
	send: (message: ClientMessage) => void,
): SettingsStore {
	const state = createStore<GameSettings>(DEFAULT_SETTINGS);

	// The snapshot carries them too, which is what makes a reconnect — or a
	// player who arrives after the host has already set the room up — land on
	// the room as it stands rather than on the defaults.
	dispatcher.on("room", (message) => state.set(message.settings));
	dispatcher.on("settings", (message) => state.set(message.settings));

	return {
		state,
		update(settings) {
			state.set(settings);
			send({ type: "settings", settings });
		},
	};
}
