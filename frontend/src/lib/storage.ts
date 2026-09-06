/**
 * The three things we keep in the browser between page loads.
 *
 * The display name is a convenience and lives in `localStorage`. The player id
 * a lobby's creator gets back is closer to a bearer token — whoever holds it
 * becomes the room's owner — so it stays in `sessionStorage`, scoped to the tab
 * that created the room, and never goes in the URL. The name a tab is playing a
 * given room under sits beside it: it is what a reload reads to get back in
 * without asking again, and it has no business outliving the tab.
 *
 * Every access is wrapped: storage throws outright in some privacy modes, and a
 * missing name is not worth taking the page down for.
 */

import { playerNameSchema } from "#/lib/schemas.ts";

const NAME_KEY = "scribble:name";

const ownerKey = (code: string) => `scribble:owner:${code}`;
const joinKey = (code: string) => `scribble:join:${code}`;

/**
 * The name this device last played under, or `null` for a first visit. What is
 * in storage is untrusted — an older build or a hand-edited value could leave
 * something the current rules reject — so it is parsed rather than read.
 */
export function storedName(): string | null {
	try {
		const stored = playerNameSchema.safeParse(localStorage.getItem(NAME_KEY));
		return stored.success ? stored.data : null;
	} catch {
		// Storage is unavailable; the caller falls back to a fresh name.
		return null;
	}
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

/**
 * Remember the name this tab is joining `code` under. Written once the player
 * has settled on it — typed on the home card, or at the door of the room — and
 * read on the way in, so a reload mid-game does not stop to ask a second time.
 */
export function rememberJoinName(code: string, name: string) {
	try {
		sessionStorage.setItem(joinKey(code), name);
	} catch {
		// Worst case they are asked again after a reload.
	}
}

/** The name this tab has already settled on for `code`, if it has. */
export function joinName(code: string): string | null {
	try {
		const stored = playerNameSchema.safeParse(
			sessionStorage.getItem(joinKey(code)),
		);
		return stored.success ? stored.data : null;
	} catch {
		return null;
	}
}
