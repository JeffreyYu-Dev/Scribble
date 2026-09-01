/**
 * The two things we keep in the browser between page loads.
 *
 * The display name is a convenience and lives in `localStorage`. The player id
 * a lobby's creator gets back is closer to a bearer token — whoever holds it
 * becomes the room's owner — so it stays in `sessionStorage`, scoped to the tab
 * that created the room, and never goes in the URL.
 *
 * Every access is wrapped: storage throws outright in some privacy modes, and a
 * missing name is not worth taking the page down for.
 */

import { randomName } from "#/lib/names.ts";
import { playerNameSchema } from "#/lib/schemas.ts";

const NAME_KEY = "scribble:name";

const ownerKey = (code: string) => `scribble:owner:${code}`;

/** The stored display name, or a fresh one persisted for next time. */
export function playerName(): string {
	try {
		const stored = playerNameSchema.safeParse(localStorage.getItem(NAME_KEY));
		if (stored.success) return stored.data;
	} catch {
		// Storage is unavailable; fall through to a throwaway name.
	}
	const name = randomName();
	savePlayerName(name);
	return name;
}

export function savePlayerName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		// Not being able to remember the name is harmless.
	}
}

/** Remember that this tab created `code`, so it can claim ownership on connect. */
export function rememberOwnership(code: string, playerId: string) {
	try {
		sessionStorage.setItem(ownerKey(code), playerId);
	} catch {
		// Worst case the creator joins as an ordinary player.
	}
}

/** The id to send when joining `code`, if this tab is the one that created it. */
export function claimedId(code: string): string | null {
	try {
		return sessionStorage.getItem(ownerKey(code));
	} catch {
		return null;
	}
}
