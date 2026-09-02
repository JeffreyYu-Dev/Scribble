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
};

export type ChatEntry =
	/** A guess that missed. */
	| { id: string; kind: "guess"; player: string; text: string; self?: boolean }
	/** A guess that landed. The word itself stays hidden from everyone else. */
	| { id: string; kind: "correct"; player: string }
	/** Near miss, shown only to the player who typed it. */
	| { id: string; kind: "close"; text: string }
	| { id: string; kind: "join" | "leave"; player: string };
