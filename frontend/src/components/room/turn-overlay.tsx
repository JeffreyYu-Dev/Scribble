/**
 * What goes on the paper when there is nothing drawn on it yet.
 *
 * Three screens share this file because they share a moment: the seconds
 * between one turn ending and the next being drawable. The round card opens a
 * round, the drawer picks a word, and everyone else watches them do it. Which
 * one a player gets is the only decision made here — the rest is the room's,
 * and arrives as props.
 *
 * It covers the sheet rather than replacing it, so the board underneath keeps
 * its size and the canvas is never unmounted mid-turn. The scrim is `bg-card`
 * and not a wash over the paper on purpose: the sheet is white in both themes,
 * and text over it would have to opt out of the theme to stay readable.
 */

import { PaletteIcon } from "lucide-react";

import type { TurnPhase } from "#/lib/room/round-store.ts";
import { cn } from "#/lib/utils.ts";

type TurnOverlayProps = {
	phase: TurnPhase;
	round: number;
	totalRounds: number;
	/** Whether the local player holds the pen this turn. */
	drawing: boolean;
	/** `null` between turns, and while a room waits for a second player. */
	drawerName: string | null;
	/** The words on offer. The drawer's alone; empty for everyone else. */
	choices: string[];
	/** Seconds left on whatever the room is waiting for. */
	secondsLeft: number;
	/** The full length of the phase, which is what the meter drains over. */
	seconds: number;
	onPick?: (choice: number) => void;
	/** The round card, which takes the paper for a beat before anything else. */
	intro?: boolean;
};

export function TurnOverlay({
	phase,
	round,
	totalRounds,
	drawing,
	drawerName,
	choices,
	secondsLeft,
	seconds,
	onPick,
	intro = false,
}: TurnOverlayProps) {
	// The card wins while it is up: a round opening is worth more than the pick
	// underneath it, and the pick is still there when it lifts.
	if (intro) {
		return (
			<Curtain>
				<RoundCard round={round} totalRounds={totalRounds} />
			</Curtain>
		);
	}

	// Every other phase has something on the paper already — a drawing being
	// made, or the answer to one.
	if (phase !== "choosing") return null;

	return (
		<Curtain>
			<Meter secondsLeft={secondsLeft} seconds={seconds} />
			{drawing ? (
				<WordChoice choices={choices} onPick={onPick} />
			) : (
				<Waiting drawerName={drawerName} />
			)}
		</Curtain>
	);
}

/**
 * The sheet, covered. Opaque enough to read against, and animated in so the
 * board is seen to be taken away rather than found missing.
 */
function Curtain({ children }: { children: React.ReactNode }) {
	return (
		<div className="absolute inset-0 z-10 flex animate-in flex-col items-center justify-center gap-3 bg-card/95 p-4 text-center text-card-foreground backdrop-blur-[2px] duration-300 fade-in">
			{children}
		</div>
	);
}

/** The round, announced. Nothing else is on screen while this is. */
function RoundCard({
	round,
	totalRounds,
}: {
	round: number;
	totalRounds: number;
}) {
	return (
		<output
			// Read out as one line: the number on its own would be announced
			// without saying what it counts.
			className="flex animate-in flex-col items-center gap-1 duration-500 zoom-in-95"
			aria-label={`Round ${round} of ${totalRounds}`}
		>
			<span
				aria-hidden
				className="text-2xs tracking-[0.3em] text-muted-foreground uppercase"
			>
				round
			</span>
			<span aria-hidden className="font-heading text-5xl font-medium">
				{round}
			</span>
			<span aria-hidden className="text-xs text-muted-foreground">
				of {totalRounds}
			</span>
		</output>
	);
}

/** The drawer's three words. */
function WordChoice({
	choices,
	onPick,
}: {
	choices: string[];
	onPick?: (choice: number) => void;
}) {
	return (
		<div className="flex flex-col items-center gap-3">
			<h2 className="font-heading text-sm font-medium">Choose a word</h2>

			{/*
				Wrapping rather than scrolling: three words is a short row on a
				board and two lines on a phone, and either reads fine.
			*/}
			<div className="flex flex-wrap items-center justify-center gap-2">
				{choices.map((word, index) => (
					<button
						key={word}
						type="button"
						onClick={() => onPick?.(index)}
						className="rounded-md bg-background px-3 py-2 font-heading text-sm font-medium ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
					>
						{word}
					</button>
				))}
			</div>

			<p className="text-2xs text-muted-foreground">
				one is picked for you if the clock runs out
			</p>
		</div>
	);
}

/** The same moment from the other side of the room. */
function Waiting({ drawerName }: { drawerName: string | null }) {
	return (
		<output className="flex flex-col items-center gap-2">
			<PaletteIcon
				aria-hidden
				className="size-6 animate-pulse text-muted-foreground"
			/>
			<p className="text-sm font-medium">
				{drawerName === null
					? "Picking a word…"
					: `${drawerName} is choosing a word…`}
			</p>
			<p className="text-2xs text-muted-foreground">
				the blanks turn up as soon as they do
			</p>
		</output>
	);
}

/**
 * How much of the pick is left, as a bar rather than a number: the count is
 * already in the top bar's ring, and a second one here would only compete with
 * the words underneath it.
 */
function Meter({
	secondsLeft,
	seconds,
}: {
	secondsLeft: number;
	seconds: number;
}) {
	const left = Math.max(0, Math.min(1, secondsLeft / seconds));
	const low = left <= 0.25;

	return (
		<div
			className="h-0.5 w-28 overflow-hidden rounded-full bg-border"
			role="timer"
			aria-label={`${secondsLeft} seconds left to choose`}
		>
			<div
				style={{ transform: `scaleX(${left})` }}
				className={cn(
					"h-full w-full origin-left rounded-full transition-transform duration-1000 ease-linear",
					low ? "bg-destructive" : "bg-primary",
				)}
			/>
		</div>
	);
}
