/**
 * Placeholder data the room renders until the socket is wired up. Nothing
 * here talks to the server: swap these for live state and every component
 * that reads them keeps working unchanged.
 */

import type { ChatEntry, Player } from "#/lib/room/types.ts";

export const MOCK_PLAYERS: Player[] = [
	{ id: "1", name: "neon pencil", score: 2140, gained: 180, status: "guessed" },
	{
		id: "2",
		name: "smudged crayon",
		score: 1980,
		gained: null,
		status: "guessing",
	},
	// You hold the pen in the placeholder room, so the board is drawable
	// without a server. Give the pen back to "smudged crayon" to see the
	// locked-out view instead. You hold the room as well, which is what puts
	// the crown on this row and lets the lobby's buttons be pressed.
	{
		id: "3",
		name: "you",
		score: 1755,
		gained: null,
		status: "drawing",
		self: true,
		host: true,
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
	// A run from one player: only the first line wears the avatar and name.
	{ id: "c4", kind: "guess", player: "you", text: "kayak", self: true },
	{ id: "c5", kind: "guess", player: "you", text: "raft", self: true },
	{ id: "c6", kind: "close", text: "raft" },
	{ id: "c7", kind: "guess", player: "faint doodle", text: "that is a shoe" },
	{ id: "c8", kind: "guess", player: "faint doodle", text: "no wait" },
	{ id: "c9", kind: "correct", player: "neon pencil" },
	{ id: "c10", kind: "guess", player: "looping marker", text: "submarine!!" },
	{ id: "c11", kind: "correct", player: "you", self: true },
	{
		id: "c12",
		kind: "guess",
		player: "blunt eraser",
		text: "no way that's it",
	},
	// The side channel, which is the point of the last two: a hollow, dotted
	// bubble is a line only the players who have the word can read. One is
	// theirs and one is yours, so the placeholder shows both halves of it.
	{
		id: "c13",
		kind: "guess",
		player: "neon pencil",
		text: "the paddle gave it away",
		scope: "guessed",
	},
	{
		id: "c14",
		kind: "guess",
		player: "you",
		text: "not a word out of you",
		self: true,
		scope: "guessed",
	},
];

/** The word this turn. The drawer sees every letter; guessers see `revealed`. */
export const MOCK_WORD = "sailboat";

/** Indices of the letters the hint has given away so far. */
export const MOCK_REVEALED = [0, 4];
