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
  { id: "c4", kind: "guess", player: "you", text: "kayak", self: true },
  { id: "c5", kind: "close", text: "kayak" },
  { id: "c6", kind: "guess", player: "faint doodle", text: "that is a shoe" },
  { id: "c7", kind: "correct", player: "neon pencil" },
  { id: "c8", kind: "guess", player: "looping marker", text: "submarine!!" },
  { id: "c9", kind: "correct", player: "faint doodle" },
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
