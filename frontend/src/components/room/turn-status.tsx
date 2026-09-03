/**
 * What the top bar says while a game is on: how long is left, whose turn it is,
 * and the word — or as much of it as this player is allowed to see.
 *
 * These are two exports rather than one component because they sit in two
 * different slots of the bar, and the bar is shared with the lobby, which fills
 * neither.
 */

import { WordHint } from "#/components/room/word-hint.tsx";
import type { TurnPhase } from "#/lib/room/round-store.ts";
import { cn } from "#/lib/utils.ts";

/** Below this the ring and the count turn red. */
const LOW_SECONDS = 10;

type TurnClockProps = {
	round: number;
	totalRounds: number;
	secondsLeft: number;
	/**
	 * The full length of whatever is being counted, which is not always a turn:
	 * the ring empties over the drawer's pick and over the reveal as well.
	 */
	turnSeconds: number;
	/** What the room is doing, which is what the line underneath reports. */
	phase: TurnPhase;
	/** Whether the local player holds the pen this turn. */
	drawing: boolean;
	/** `null` between turns, and while a room waits for a second player. */
	drawerName: string | null;
};

export function TurnClock({
	round,
	totalRounds,
	secondsLeft,
	turnSeconds,
	phase,
	drawing,
	drawerName,
}: TurnClockProps) {
	return (
		<div className="flex min-w-0 items-center gap-2.5">
			<TurnTimer secondsLeft={secondsLeft} turnSeconds={turnSeconds} />
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="text-xs font-medium">
					round {round}
					<span className="text-muted-foreground">/{totalRounds}</span>
				</span>
				<span className="truncate text-2xs text-muted-foreground">
					{turnLine(phase, drawing, drawerName)}
				</span>
			</div>
		</div>
	);
}

/** One line on what the room is up to, from this player's side of it. */
function turnLine(
	phase: TurnPhase,
	drawing: boolean,
	drawerName: string | null,
) {
	if (drawerName === null) return "waiting for the round to start";

	switch (phase) {
		case "choosing":
			return drawing ? "pick your word" : `${drawerName} is choosing a word`;
		case "reveal":
			return "the word is up";
		default:
			return drawing ? "your turn" : `${drawerName} is drawing`;
	}
}

type TurnWordProps = {
	/** What `WordHint` renders — the word, or the mask standing in for it. */
	word: string;
	revealed: number[];
	/** Show every letter — the drawer's whole turn, and everyone's once it ends. */
	reveal: boolean;
	drawing: boolean;
};

export function TurnWord({ word, revealed, reveal, drawing }: TurnWordProps) {
	return (
		<div className="flex flex-col items-center gap-1">
			<span className="text-2xs tracking-widest text-muted-foreground uppercase">
				{drawing ? "draw this" : "guess the word"}
			</span>
			<WordHint word={word} revealed={revealed} reveal={reveal} />
		</div>
	);
}

/**
 * Seconds left on the turn, wrapped in a ring that empties as they run out.
 * The ring eases linearly so it keeps pace with the count rather than
 * springing between ticks.
 */
function TurnTimer({
	secondsLeft,
	turnSeconds,
}: {
	secondsLeft: number;
	turnSeconds: number;
}) {
	const radius = 15;
	const circumference = 2 * Math.PI * radius;
	const left = Math.max(0, Math.min(1, secondsLeft / turnSeconds));
	const low = secondsLeft <= LOW_SECONDS;

	return (
		<div
			className="relative flex size-9 shrink-0 items-center justify-center"
			role="timer"
			aria-label={`${secondsLeft} seconds left this turn`}
		>
			<svg
				aria-hidden
				role="presentation"
				viewBox="0 0 36 36"
				className="absolute size-full -rotate-90"
			>
				<circle
					cx="18"
					cy="18"
					r={radius}
					fill="none"
					strokeWidth="2.5"
					className="stroke-border"
				/>
				<circle
					cx="18"
					cy="18"
					r={radius}
					fill="none"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={circumference * (1 - left)}
					className={cn(
						"transition-[stroke-dashoffset] duration-1000 ease-linear",
						low ? "stroke-destructive" : "stroke-primary",
					)}
				/>
			</svg>
			<span
				className={cn(
					"text-xs font-medium tabular-nums",
					low && "text-destructive",
				)}
			>
				{secondsLeft}
			</span>
		</div>
	);
}
