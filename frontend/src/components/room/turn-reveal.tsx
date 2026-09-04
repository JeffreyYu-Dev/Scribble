/**
 * The answer, and what the turn was worth to everyone.
 *
 * It takes the paper for the few seconds between one turn ending and the next
 * drawer picking, which is the one moment in a round where the word is safe to
 * print and the scores have all settled. Both are already elsewhere on screen —
 * the word in the top bar, the points in the rail — but neither is where anyone
 * is looking when a turn ends, and a score that ticks up in the corner is a
 * score nobody sees change.
 *
 * The order is the turn's, not the game's: whoever got there first is at the
 * top, and the rail behind is still the running standings. Ties keep join
 * order, so the room's own order is what breaks them rather than the sort.
 */

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

import type { Player } from "#/lib/room/types.ts";

type TurnRevealProps = {
	/** The word, now that there is nothing left to give away. */
	answer: string;
	/** The roster as the turn left it, in join order. */
	players: Player[];
	/** Whether to move at all. Set from the viewer's own preference. */
	reduced?: boolean;
};

export function TurnReveal({
	answer,
	players,
	reduced = false,
}: TurnRevealProps) {
	const list = useRef<HTMLUListElement>(null);

	// The rows arrive after the word, one after another, which is what makes
	// the scoring read as a result rather than as a table that was always
	// there. They are animated here rather than in the overlay's own timeline
	// because only this screen has rows to stagger.
	useGSAP(
		() => {
			if (reduced) return;
			gsap.fromTo(
				list.current?.children ?? [],
				{ autoAlpha: 0, x: -8 },
				{
					autoAlpha: 1,
					x: 0,
					duration: 0.3,
					ease: "power2.out",
					stagger: 0.055,
					delay: 0.22,
				},
			);
		},
		{ dependencies: [reduced], scope: list },
	);

	const scored = rank(players);

	return (
		// An `output` so the answer is read out when it lands, rather than
		// being something a screen reader only finds by looking: this is the
		// one moment the word is said aloud to the whole room.
		<output className="flex w-full max-w-xs flex-col items-center gap-4">
			<div className="flex flex-col items-center gap-1.5">
				<span className="text-2xs tracking-[0.3em] text-muted-foreground uppercase">
					the word was
				</span>
				<h2 className="font-heading text-2xl font-medium break-words">
					{answer}
				</h2>
				<p className="text-2xs text-muted-foreground">{ending(players)}</p>
			</div>

			{/*
				Capped rather than left to grow: a full room is taller than the
				sheet, and the word above it is the part that must not be pushed
				off. Nothing here is interactive, so scrolling it is a fallback
				and not a way anyone is expected to read it.
			*/}
			<ul
				ref={list}
				className="flex max-h-48 w-full flex-col gap-0.5 overflow-y-auto px-2"
			>
				{scored.map((player) => (
					<li
						key={player.id}
						className="flex items-baseline justify-between gap-3 text-sm"
					>
						<span className="min-w-0 truncate font-medium">
							{player.name}
							{player.self ? (
								<span className="font-normal text-muted-foreground">
									{" "}
									(you)
								</span>
							) : null}
						</span>
						<Gain gained={player.gained} />
					</li>
				))}
			</ul>
		</output>
	);
}

/** What one player took from the turn. Nothing is worth saying plainly too. */
function Gain({ gained }: { gained: number | null }) {
	const points = gained ?? 0;

	return (
		<span
			className={
				points > 0
					? "shrink-0 font-medium text-primary tabular-nums"
					: "shrink-0 text-muted-foreground tabular-nums"
			}
		>
			{points > 0 ? `+${points}` : "0"}
		</span>
	);
}

/**
 * The roster by what this turn was worth, highest first. `sort` is stable in
 * every engine this runs on, so everyone who scored nothing is left in the
 * order the room filled up in rather than shuffled.
 */
function rank(players: Player[]) {
	return [...players].sort((a, b) => (b.gained ?? 0) - (a.gained ?? 0));
}

/**
 * Why the turn is over. The server does not say, and does not need to: a turn
 * that ended early is one where nobody is left still guessing, and that is on
 * the roster it sent with the reveal.
 */
function ending(players: Player[]) {
	const guessers = players.filter((player) => player.status !== "drawing");
	const all =
		guessers.length > 0 &&
		guessers.every((player) => player.status === "guessed");

	if (all) return "everyone got it";
	return guessers.some((player) => player.status === "guessed")
		? "time is up"
		: "nobody got it";
}
