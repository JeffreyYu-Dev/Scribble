/**
 * Which of the player inks a name wears. Handed out in join order so the first
 * seven players in a room are all different, and resolved through one map that
 * both the scoreboard and the chat read — the two would otherwise have to agree
 * by luck, and the scoreboard reorders itself every time someone scores.
 */

/** Matches the `--ink-*` steps defined in `styles.css`. */
const INK_COUNT = 7;

/** The nth ink, wrapping once a room is fuller than the ramp is long. */
function inkAt(index: number) {
	return `var(--ink-${(index % INK_COUNT) + 1})`;
}

/** FNV-1a, 32-bit. Only ever reached by a name the room no longer holds. */
function hash(value: string) {
	let h = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		h ^= value.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export type InkMap = ReadonlyMap<string, string>;

/**
 * Builds the room's name-to-ink map. `players` must be in join order, not
 * score order, or a player's colour would change under them as they score.
 */
export function inkMap(players: readonly { name: string }[]): InkMap {
	return new Map(players.map((player, i) => [player.name, inkAt(i)]));
}

/**
 * The ink for one name. Someone who has since left the room is no longer in
 * the map but may still be named in the chat, so they fall back to a colour
 * derived from the name itself.
 */
export function inkFor(inks: InkMap, name: string) {
	return inks.get(name) ?? inkAt(hash(name));
}
