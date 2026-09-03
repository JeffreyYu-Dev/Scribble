/**
 * The turn: which round it is, who holds the pen, and how much of the word has
 * been given away.
 *
 * The server sends the time left rather than a deadline, because the two clocks
 * do not agree and only one of them is authoritative. It is turned into a local
 * deadline the moment it lands, so the countdown can run without another
 * message and re-synchronises on every turn or reconnect.
 */

import type { Dispatcher } from "#/lib/net/dispatch.ts";
import type { Store } from "#/lib/net/store.ts";
import { createStore } from "#/lib/net/store.ts";
import { TOTAL_ROUNDS, TURN_SECONDS } from "#/lib/room/constants.ts";
import type {
	ClientMessage,
	ServerMessage,
	WireTurn,
} from "#/lib/room/protocol.ts";
import { HIDDEN } from "#/lib/room/protocol.ts";

/**
 * What the room is doing. The three the server sends, plus the one it does not
 * have to: a room with no turn running says so with a message of its own, and
 * `idle` is where that lands.
 */
export type TurnPhase = "idle" | "choosing" | "drawing" | "reveal";

export type Turn = {
	round: number;
	totalRounds: number;
	phase: TurnPhase;
	/** `null` between turns. */
	drawerId: string | null;
	/** The word, once we are allowed to see it. */
	word: string | null;
	/** The word with hidden letters masked. */
	hint: string;
	/** The words the drawer is picking between. Empty for everyone else. */
	choices: string[];
	/** The full length of the phase, which is what the timer ring empties over. */
	seconds: number;
	/** `Date.now()` when the phase runs out; `null` when no turn is running. */
	deadline: number | null;
};

const IDLE: Turn = {
	round: 0,
	totalRounds: TOTAL_ROUNDS,
	phase: "idle",
	drawerId: null,
	word: null,
	hint: "",
	choices: [],
	seconds: TURN_SECONDS,
	deadline: null,
};

export type RoundStore = {
	state: Store<Turn>;
	/** Take one of the words offered. The server ignores anyone but the drawer. */
	pick: (choice: number) => void;
};

export function createRoundStore(
	dispatcher: Dispatcher<ServerMessage>,
	send: (message: ClientMessage) => void,
): RoundStore {
	const state = createStore<Turn>(IDLE);

	dispatcher.on("room", (message) => {
		state.set(message.turn ? toTurn(message.turn) : IDLE);
	});

	dispatcher.on("turn", (message) => state.set(toTurn(message.turn)));

	dispatcher.on("hint", (message) => {
		state.set((current) => ({ ...current, hint: message.hint }));
	});

	// Between turns the round and the total stay on screen; only the word and
	// the clock go away.
	dispatcher.on("idle", () => {
		state.set((current) => ({
			...current,
			phase: "idle",
			drawerId: null,
			word: null,
			hint: "",
			choices: [],
			deadline: null,
		}));
	});

	return {
		state,
		pick(choice) {
			send({ type: "pick", choice });
		},
	};
}

function toTurn(turn: WireTurn): Turn {
	return {
		round: turn.round,
		totalRounds: turn.totalRounds,
		phase: turn.phase,
		drawerId: turn.drawerId,
		word: turn.word,
		hint: turn.hint,
		choices: turn.choices,
		seconds: turn.seconds,
		deadline: Date.now() + turn.endsIn * 1000,
	};
}

/**
 * The turn as `WordHint` wants it. A guesser is handed the masked word with the
 * positions that have been given away, so the hidden letters are never in the
 * page at all; once `word` arrives — the drawer's whole turn, and everyone's
 * once it ends — the mask is dropped and the word is simply shown.
 */
export function wordSlots(turn: Turn) {
	if (turn.word !== null) {
		return { word: turn.word, revealed: [], reveal: true };
	}

	const revealed: number[] = [];
	// Split by code point, matching how `WordHint` numbers its slots.
	[...turn.hint].forEach((char, index) => {
		if (char !== HIDDEN && char !== " ") revealed.push(index);
	});

	return { word: turn.hint, revealed, reveal: false };
}
