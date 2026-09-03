/**
 * What the host can change before a game starts.
 *
 * These are the room's settings, not the browser's: they belong to the room and
 * will be the host's to set over the socket. Until that message exists they
 * live in the lobby's own state, and the defaults below are what the server is
 * already playing by — `constants.ts` holds the two the game itself reads.
 *
 * TODO: send these on start, and take them from the room snapshot instead of
 * from `DEFAULT_SETTINGS`, once the protocol carries a settings message.
 */

import { TOTAL_ROUNDS, TURN_SECONDS } from "#/lib/room/constants.ts";

export type GameSettings = {
	rounds: number;
	/** Length of one turn, which is what the timer ring empties over. */
	drawSeconds: number;
	maxPlayers: number;
	/** Letters given away over the course of a turn. */
	hints: number;
};

export const DEFAULT_SETTINGS: GameSettings = {
	rounds: TOTAL_ROUNDS,
	drawSeconds: TURN_SECONDS,
	maxPlayers: 12,
	hints: 2,
};

/**
 * The values each setting may take. A fixed set rather than a slider: these are
 * read at a glance across a lobby, and a room argues less about four choices
 * than about eighty.
 */
export const SETTING_CHOICES = {
	rounds: [2, 3, 4, 5],
	drawSeconds: [40, 60, 80, 120],
	maxPlayers: [4, 8, 12],
	hints: [0, 1, 2, 3],
} as const satisfies Record<keyof GameSettings, readonly number[]>;
