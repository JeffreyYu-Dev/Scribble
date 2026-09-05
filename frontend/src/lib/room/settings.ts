/**
 * What the host can change before a game starts.
 *
 * These are the room's settings, not the browser's: the host sends them over
 * the socket, the server decides what they actually come to, and what comes
 * back is what every player — host or not — is shown. So nothing here is the
 * last word on anything. The defaults below are only what a room plays by
 * before anyone has touched it, and they have to match `DefaultSettings()` in
 * `backend/internal/game/settings.go`.
 *
 * The helpers at the bottom are the other half of that agreement: the server
 * cleans the word bank whatever the client sends, and `parseWordBank` cleans it
 * the same way first, so the host is not shown one thing and given another.
 */

import {
	TOTAL_ROUNDS,
	TURN_SECONDS,
	WORD_CHOICES,
} from "#/lib/room/constants.ts";

/**
 * Where a turn's words come from. `mixed` adds the room's own words to the
 * built-in list rather than replacing it, which is what makes a handful of
 * inside jokes worth adding at all.
 */
export type WordSource = "default" | "mixed" | "custom";

export type GameSettings = {
	rounds: number;
	/** Length of one turn, which is what the timer ring empties over. */
	drawSeconds: number;
	maxPlayers: number;
	/** Letters given away over the course of a turn. */
	hints: number;
	wordSource: WordSource;
	/** The room's own words. Empty unless the host has typed some. */
	words: string[];
};

export const DEFAULT_SETTINGS: GameSettings = {
	rounds: TOTAL_ROUNDS,
	drawSeconds: TURN_SECONDS,
	maxPlayers: 12,
	hints: 2,
	wordSource: "default",
	words: [],
};

/** The settings that are a number, which is all of them but the word bank. */
export type NumericSetting = "rounds" | "drawSeconds" | "maxPlayers" | "hints";

/**
 * The values each setting may take. A fixed set rather than a slider: these are
 * read at a glance across a lobby, and a room argues less about four choices
 * than about eighty.
 *
 * The server takes a wider range than this — it only has to keep a value safe,
 * where the list here is what keeps it legible — so a value outside these is
 * clamped rather than refused.
 */
export const SETTING_CHOICES = {
	rounds: [2, 3, 4, 5],
	drawSeconds: [40, 60, 80, 120],
	maxPlayers: [4, 8, 12],
	hints: [0, 1, 2, 3],
} as const satisfies Record<NumericSetting, readonly number[]>;

export const WORD_SOURCES: {
	id: WordSource;
	label: string;
	/** What the room gets, in the one line the picker has room for. */
	hint: string;
}[] = [
	{ id: "default", label: "Built-in", hint: "The standard word list." },
	{
		id: "mixed",
		label: "Built-in + yours",
		hint: "Your words are added to the standard list.",
	},
	{ id: "custom", label: "Yours only", hint: "Only the words you write." },
];

/**
 * Bounds on the bank, matching `settings.go`. `MIN_CUSTOM_WORDS` is not a limit
 * the server enforces but the point below which it cannot honour "yours only":
 * a turn deals `WORD_CHOICES` words at once, and a shorter bank would have to
 * offer the same word twice, so the built-in list stands in instead.
 */
export const MAX_CUSTOM_WORDS = 200;
export const MAX_WORD_LENGTH = 32;
export const MIN_CUSTOM_WORDS = WORD_CHOICES;

/**
 * The host's typing as a list of words. Commas and newlines both separate, so
 * a pasted list works however it was written down.
 *
 * Duplicates go by case and spacing, which is what a guess is matched on: two
 * entries a player could not tell apart are one word.
 */
export function parseWordBank(text: string): string[] {
	const seen = new Set<string>();
	const words: string[] = [];

	for (const raw of text.split(/[,\n]/)) {
		const word = raw
			.trim()
			.replace(/\s+/g, " ")
			.slice(0, MAX_WORD_LENGTH)
			.trim();
		if (!word) continue;

		const key = word.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		words.push(word);
		if (words.length === MAX_CUSTOM_WORDS) break;
	}

	return words;
}

/** The bank as the host edits it: one line each, so a long list stays readable. */
export function formatWordBank(words: string[]): string {
	return words.join("\n");
}

/**
 * Whether the bank is long enough for the room to play the source it is set to.
 * Only `custom` can fall short — the other two have the built-in list behind
 * them — and a room that does gets the built-in list instead.
 */
export function bankIsShort(settings: GameSettings): boolean {
	return (
		settings.wordSource === "custom" && settings.words.length < MIN_CUSTOM_WORDS
	);
}
