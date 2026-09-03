/**
 * The games a room can play.
 *
 * One record per minigame, in the order the lobby grid lays them out. Every
 * part of the lobby reads from here — the tile, the stage panel above it and
 * the summary card beside the roster — so adding a game is adding a row rather
 * than touching three components.
 *
 * The room holds one of these at a time, which is why the id is what gets
 * passed around: the selection is a string the server will eventually own, and
 * everything else is looked up from it.
 */

import type { LucideIcon } from "lucide-react";
import { PencilIcon } from "lucide-react";

export type MiniGame = {
	id: string;
	name: string;
	/** One line, shown under the name on the stage panel. */
	tagline: string;
	description: string;
	players: { min: number; max: number };
	icon: LucideIcon;
	/**
	 * The ink the placeholder art is mixed from, as a `--ink-*` step. A game
	 * keeps its colour once it has real art: the tile falls back to this wash
	 * behind a background that has not been drawn yet.
	 */
	accent: string;
	/** Background art. Absent until one is drawn, which is what `accent` covers. */
	art?: string;
	/** A game still being built holds its place in the grid but cannot be started. */
	ready: boolean;
};

export const MINIGAMES: MiniGame[] = [
	{
		id: "guessing",
		name: "Guessing",
		tagline: "One draws, everyone else races to name it.",
		description:
			"A word goes to the drawer and a row of blanks to everyone else. " +
			"Letters are given away as the clock runs down, and a guess is worth " +
			"more the earlier it lands.",
		players: { min: 2, max: 12 },
		icon: PencilIcon,
		accent: "var(--ink-3)",
		ready: true,
	},
];

/**
 * Empty slots drawn after the real games, so the grid reads as a shelf with
 * room on it rather than as one lonely tile. Drop this to zero once the shelf
 * fills up on its own.
 */
export const PLACEHOLDER_SLOTS = 8;

export const DEFAULT_GAME_ID = MINIGAMES[0].id;

/** The game a room is on, falling back to the first rather than to nothing. */
export function gameById(id: string): MiniGame {
	return MINIGAMES.find((game) => game.id === id) ?? MINIGAMES[0];
}
