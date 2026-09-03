/** Shapes the room UI renders. */

export type PlayerStatus =
	/** Waiting for their turn, still guessing. */
	| "guessing"
	/** Holding the pen this turn. */
	| "drawing"
	/** Already got the word this turn. */
	| "guessed";

export type Player = {
	id: string;
	name: string;
	score: number;
	/** Points won this turn, flashed beside the score. `null` until they score. */
	gained: number | null;
	status: PlayerStatus;
	/** Marks the local player so the list can label the row. */
	self?: boolean;
	/** Whoever holds the room: the one who picks the game and starts it. */
	host?: boolean;
};

/**
 * Who can read a line. `guessed` is the side channel of the players who have
 * the word — the drawer and whoever has guessed it — which the server sends to
 * nobody else; the panel draws those lines as the aside they are.
 */
export type ChatScope = "all" | "guessed";

export type ChatEntry =
	/** A guess that missed, or anything else said in the room. */
	| {
			id: string;
			kind: "guess";
			player: string;
			text: string;
			self?: boolean;
			/** Defaults to `all`; only the side channel says otherwise. */
			scope?: ChatScope;
	  }
	/** A guess that landed. The word itself stays hidden from everyone else. */
	| { id: string; kind: "correct"; player: string; self?: boolean }
	/** Near miss, shown only to the player who typed it. */
	| { id: string; kind: "close"; text: string }
	| { id: string; kind: "join" | "leave"; player: string };
