/**
 * Shapes the room UI renders, plus the placeholder data it renders until the
 * socket is wired up. Nothing here talks to the server: swap `MOCK_ROOM` for
 * live state and every component below keeps working unchanged.
 */

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

export type Tool = "pen" | "eraser" | "fill";

/** Stroke widths in canvas pixels, smallest first. */
export const BRUSH_SIZES = [4, 10, 20, 34] as const;

export type BrushSize = (typeof BRUSH_SIZES)[number];

/**
 * Two rows of the classic ink palette: a light row over its shaded twin, so a
 * colour and its shadow sit in the same column.
 */
export const PALETTE = [
	[
		"#ffffff",
		"#c1c1c1",
		"#ef130b",
		"#ff7100",
		"#ffe400",
		"#00cc00",
		"#00b2ff",
		"#231fd3",
		"#a300ba",
		"#d37caa",
		"#a0522d",
	],
	[
		"#000000",
		"#4c4c4c",
		"#740b07",
		"#c23800",
		"#e8a200",
		"#005510",
		"#00569e",
		"#0e0865",
		"#550069",
		"#a75574",
		"#63300d",
	],
] as const;

export const TURN_SECONDS = 80;
export const TOTAL_ROUNDS = 3;

export const MOCK_PLAYERS: Player[] = [
	{ id: "1", name: "neon pencil", score: 2140, gained: 180, status: "guessed" },
	{
		id: "2",
		name: "smudged crayon",
		score: 1980,
		gained: null,
		status: "drawing",
	},
	{
		id: "3",
		name: "you",
		score: 1755,
		gained: 120,
		status: "guessed",
		self: true,
	},
	{
		id: "4",
		name: "jagged stencil",
		score: 1310,
		gained: null,
		status: "guessing",
	},
	{
		id: "5",
		name: "faint doodle",
		score: 940,
		gained: null,
		status: "guessing",
	},
	{
		id: "6",
		name: "looping marker",
		score: 615,
		gained: null,
		status: "guessing",
	},
	{
		id: "7",
		name: "blunt eraser",
		score: 300,
		gained: null,
		status: "guessing",
	},
];

export const MOCK_CHAT: ChatEntry[] = [
	{ id: "c1", kind: "join", player: "blunt eraser" },
	{ id: "c2", kind: "guess", player: "neon pencil", text: "a boat?" },
	{ id: "c3", kind: "guess", player: "jagged stencil", text: "canoe" },
	{ id: "c4", kind: "guess", player: "you", text: "kayak", self: true },
	{ id: "c5", kind: "close", text: "kayak" },
	{ id: "c6", kind: "guess", player: "faint doodle", text: "that is a shoe" },
	{ id: "c7", kind: "correct", player: "neon pencil" },
	{ id: "c8", kind: "guess", player: "looping marker", text: "submarine!!" },
	{ id: "c9", kind: "correct", player: "you" },
	{
		id: "c10",
		kind: "guess",
		player: "blunt eraser",
		text: "no way that's it",
	},
];

/** The word this turn. The drawer sees every letter; guessers see `revealed`. */
export const MOCK_WORD = "sailboat";

/** Indices of the letters the hint has given away so far. */
export const MOCK_REVEALED = [0, 4];
