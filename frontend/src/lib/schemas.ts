/**
 * Every value the player types, plus the one we read back off their device.
 * The UI keeps its own input masks (maxLength, the uppercase filter on the room
 * code) for feel, but these schemas are what decides whether a value is good.
 */

import { z } from "zod";

export const NAME_MAX = 16;
export const CODE_LENGTH = 5;
export const GUESS_MAX = 60;

export const playerNameSchema = z
	.string()
	.trim()
	.min(1, "Pick a name before you play.")
	.max(NAME_MAX, `Names are ${NAME_MAX} characters or fewer.`);

export const roomCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(
		new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`),
		`Room codes are ${CODE_LENGTH} characters.`,
	);

export const guessSchema = z.string().trim().min(1).max(GUESS_MAX);

/**
 * What the server sends back. These are parsed rather than cast: the responses
 * cross a network boundary, and a mismatch here is the cheapest place to catch
 * a backend change.
 */

/** `POST /lobby` — the new room's code, and the id that owns it. */
export const createLobbySchema = z.object({
	code: roomCodeSchema,
	playerId: z.uuid(),
});

/** The websocket's reply to the join message. */
export const joinAckSchema = z.object({
	playerId: z.uuid(),
	code: roomCodeSchema,
	owner: z.boolean(),
});

export type JoinAck = z.infer<typeof joinAckSchema>;

export type PlayerName = z.infer<typeof playerNameSchema>;
export type RoomCode = z.infer<typeof roomCodeSchema>;

/** First failure message from a `safeParse`, or `null` when the value is good. */
export function errorOf(result: z.ZodSafeParseResult<unknown>) {
	return result.success ? null : result.error.issues[0].message;
}
