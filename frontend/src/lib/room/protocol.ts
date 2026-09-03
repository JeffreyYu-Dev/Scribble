/**
 * Everything that crosses the socket, in one file.
 *
 * Incoming messages are parsed rather than cast: they come off a network, and a
 * server that has drifted is cheapest to catch here, at the door, instead of as
 * `undefined` three components deep. Outgoing messages are plain types — the
 * server validates those.
 *
 * Every message is tagged with `type`, which is what `createDispatcher` routes
 * on. The Go side of this contract lives in `backend/internal/game/protocol.go`;
 * the two are one protocol written twice, so a change to either is a change to
 * both.
 */

import { z } from "zod";

import type { DrawCommand } from "#/lib/drawing/types.ts";
import { TOTAL_ROUNDS, TURN_SECONDS } from "#/lib/room/constants.ts";
import { joinAckSchema } from "#/lib/schemas.ts";

/* -------------------------------------------------------------- primitives */

const pointSchema = z.object({ x: z.number(), y: z.number() });

/**
 * The board's vocabulary, mirroring `lib/drawing/types.ts`. The two are kept
 * separate on purpose: that file is what the canvas renders, this is what the
 * wire is allowed to say, and only one of them may be shaped by the server.
 */
const drawCommandSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("stroke"),
		id: z.string(),
		color: z.string(),
		size: z.number(),
		points: z.array(pointSchema),
	}),
	z.object({ kind: z.literal("fill"), color: z.string(), at: pointSchema }),
	z.object({ kind: z.literal("clear") }),
]);

const playerSchema = z.object({
	id: z.string(),
	name: z.string(),
	score: z.number(),
	/** Points won this turn. Cleared by the server when the next one starts. */
	gained: z.number().nullable().default(null),
	status: z.enum(["guessing", "drawing", "guessed"]).default("guessing"),
	/**
	 * Whoever holds the room. The server sends it for that one player and omits
	 * it for the rest, which is what the default is covering.
	 */
	host: z.boolean().default(false),
});

/**
 * One line of the feed. `close` is only ever sent to the player who typed it,
 * and `correct` carries no text, so the word never reaches a guesser through
 * the transcript.
 */
const chatEntrySchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("guess"),
		id: z.string(),
		playerId: z.string(),
		player: z.string(),
		text: z.string(),
	}),
	z.object({
		kind: z.literal("correct"),
		id: z.string(),
		playerId: z.string(),
		player: z.string(),
	}),
	z.object({ kind: z.literal("close"), id: z.string(), text: z.string() }),
	z.object({ kind: z.literal("join"), id: z.string(), player: z.string() }),
	z.object({ kind: z.literal("leave"), id: z.string(), player: z.string() }),
]);

/** The character the server masks an unrevealed letter with. */
export const HIDDEN = "_";

const turnSchema = z.object({
	round: z.number().int(),
	totalRounds: z.number().int().default(TOTAL_ROUNDS),
	/**
	 * What the room is doing: the drawer picking their word, the clock running,
	 * or the answer up between turns.
	 */
	phase: z.enum(["choosing", "drawing", "reveal"]).default("drawing"),
	drawerId: z.string(),
	/**
	 * The word itself. Sent to the drawer for the whole turn, and to everyone
	 * once the turn is over; `null` for a guesser mid-turn, and for everyone
	 * while it is still being picked.
	 */
	word: z.string().nullable().default(null),
	/** The word with hidden letters as `_`. Same length, spaces kept. */
	hint: z.string(),
	/**
	 * The words on offer, which the server sends to the drawer and to nobody
	 * else — two of the three being wrong would not make the right one safe to
	 * hand a guesser. Empty outside the pick.
	 */
	choices: z.array(z.string()).default([]),
	/** How long the current phase lasts, for the timer ring. */
	seconds: z.number().default(TURN_SECONDS),
	/**
	 * Seconds left in the phase when the server sent this. Deliberately
	 * relative: a deadline
	 * would need the two clocks to agree, and they do not.
	 */
	endsIn: z.number(),
});

export type WirePlayer = z.infer<typeof playerSchema>;
export type WireChatEntry = z.infer<typeof chatEntrySchema>;
export type WireTurn = z.infer<typeof turnSchema>;

/* ------------------------------------------------------- server -> client */

export const serverMessageSchema = z.discriminatedUnion("type", [
	/** The join acknowledgement. Always first, and re-sent on every reconnect. */
	joinAckSchema.extend({ type: z.literal("joined") }),

	/**
	 * The whole room in one message, sent straight after `joined`. Everything
	 * below is an update to this, so a reconnect needs no other repair: the
	 * snapshot replaces whatever the stores were holding.
	 */
	z.object({
		type: z.literal("room"),
		/** In join order, which is what fixes each player's colour. */
		players: z.array(playerSchema),
		chat: z.array(chatEntrySchema).default([]),
		turn: turnSchema.nullable().default(null),
	}),

	/** The roster, whenever anyone joins, leaves, or scores. Join order. */
	z.object({ type: z.literal("players"), players: z.array(playerSchema) }),

	/** One line for the feed. */
	z.object({ type: z.literal("chat"), entry: chatEntrySchema }),

	/** A new turn, or the same turn revealed once it ends. */
	z.object({ type: z.literal("turn"), turn: turnSchema }),

	/** A letter given away. Cheaper than re-sending the turn. */
	z.object({ type: z.literal("hint"), hint: z.string() }),

	/** Between turns and after the last round. */
	z.object({ type: z.literal("idle") }),

	/**
	 * Strokes from the drawer. The server does not echo these to whoever made
	 * them — that client has already drawn them.
	 */
	z.object({ type: z.literal("draw"), commands: z.array(drawCommandSchema) }),

	/** The board so far, for a client that arrived mid-turn. Replaces it whole. */
	z.object({ type: z.literal("canvas"), commands: z.array(drawCommandSchema) }),

	/** Something went wrong that is worth telling the player about. */
	z.object({ type: z.literal("error"), message: z.string() }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

/**
 * Decodes a frame, or returns `null` when it is not a message we know. The
 * caller drops those: a server one version ahead should not take the room down.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
	const parsed = serverMessageSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/* ------------------------------------------------------- client -> server */

export type ClientMessage =
	/**
	 * Always first on a fresh socket: the server reads exactly one of these and
	 * hangs up if it does not arrive. `playerId` is only held by the tab that
	 * created the lobby, and is what claims ownership of it.
	 */
	| { type: "join"; code: string; username: string; playerId?: string }
	| { type: "guess"; text: string }
	/** The drawer taking one of the words offered, by its index in `choices`. */
	| { type: "pick"; choice: number }
	| { type: "draw"; commands: DrawCommand[] };
