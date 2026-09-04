/**
 * How the game finished: the winner, whoever ran them close, and everyone else.
 *
 * The room has been watching a scoreboard reorder itself all game, so a fourth
 * table of the same numbers would say nothing. What it has not seen is the
 * game's own shape — who was ahead of whom, and by how much — so this is built
 * as a podium and not as a list, and it is built in front of the room rather
 * than found already standing: the blocks rise shortest first, so the winner's
 * is the last thing to land.
 *
 * It goes up on the board the last turn was drawn on, in the seconds between
 * the game ending and the room falling back to its lobby. The chat underneath
 * stays open the whole time, which is where a room actually talks about a game
 * it has just finished.
 */

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CrownIcon } from "lucide-react";
import { useRef } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import type { InkMap } from "#/lib/room/ink.ts";
import { inkFor } from "#/lib/room/ink.ts";
import type { Player } from "#/lib/room/types.ts";
import { cn } from "#/lib/utils.ts";

/** How tall each place's block stands. The gap between them is the story. */
const PLINTH = { 1: "4.5rem", 2: "3.25rem", 3: "2.25rem" } as const;

/**
 * When each place arrives, in seconds from the top of the timeline. Third
 * first: a podium filled from the bottom up puts the pause before the winner,
 * which is the only part of this anyone is waiting for.
 */
const CUE = { 3: 0, 2: 0.16, 1: 0.34 } as const;

type Place = keyof typeof PLINTH;

type GameResultsProps = {
	/** The final roster, in join order. Ranked here by score. */
	players: Player[];
	/** The room's colours, so a player wears the same one they played in. */
	inks: InkMap;
	/** Whether to move at all. Set from the viewer's own preference. */
	reduced?: boolean;
};

export function GameResults({
	players,
	inks,
	reduced = false,
}: GameResultsProps) {
	const root = useRef<HTMLOutputElement>(null);

	const ranked = [...players].sort((a, b) => b.score - a.score);
	// Left to right as a podium stands, which is not the order they placed in.
	const podium: Place[] = [2, 1, 3];
	const rest = ranked.slice(3);

	useGSAP(
		() => {
			if (reduced) return;

			const timeline = gsap.timeline({ delay: 0.15 });

			for (const place of [3, 2, 1] as Place[]) {
				const at = CUE[place];

				timeline
					.fromTo(
						`[data-plinth="${place}"]`,
						{ scaleY: 0 },
						{
							scaleY: 1,
							duration: 0.42,
							// A block that overshoots and settles reads as landing
							// rather than as growing.
							ease: "back.out(1.4)",
						},
						at,
					)
					.fromTo(
						`[data-topper="${place}"]`,
						{ autoAlpha: 0, y: 12 },
						{ autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" },
						at + 0.14,
					);
			}

			// The crown drops onto the winner once their block has stopped moving,
			// and is the last thing to happen.
			timeline.fromTo(
				"[data-crown]",
				{ autoAlpha: 0, y: -14, scale: 0.6, rotate: -18 },
				{
					autoAlpha: 1,
					y: 0,
					scale: 1,
					rotate: 0,
					duration: 0.5,
					ease: "back.out(2.4)",
				},
				CUE[1] + 0.34,
			);

			timeline.fromTo(
				"[data-also]",
				{ autoAlpha: 0, y: 6 },
				{ autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.05 },
				CUE[1] + 0.4,
			);

			// The scores run up to what they finished on. Tweened as a number and
			// written to the node, rather than held in state: this ticks every
			// frame for half a second, and none of it is worth a re-render.
			const scores = gsap.utils.toArray<HTMLElement>(
				"[data-score]",
				root.current,
			);
			for (const element of scores) {
				const total = Number(element.dataset.score ?? 0);
				const place = Number(element.dataset.place ?? 1) as Place;
				const counter = { at: 0 };

				// Zeroed now and not when the tween starts. The markup carries the
				// number the count ends on — it has to, for a reader that never
				// sees any of this — and the topper is visible for a few frames
				// before the counting begins, which is long enough to read it.
				element.textContent = "0";

				timeline.to(
					counter,
					{
						at: total,
						duration: 0.55,
						ease: "power2.out",
						onUpdate() {
							element.textContent = String(Math.round(counter.at));
						},
					},
					CUE[place] + 0.2,
				);
			}
		},
		// Once, on the way in. A player leaving mid-podium changes the roster
		// under it, and replaying the whole thing to report that would be a
		// worse answer than letting their block go: React remounts the step
		// that moved up, and it simply appears where the animation left off.
		{ dependencies: [reduced], scope: root },
	);

	return (
		// An `output` so the result is read out when it lands: the podium is a
		// picture, and the ranking behind it has to reach a screen reader as
		// something other than three loose names.
		<output ref={root} className="flex w-full max-w-sm flex-col items-center">
			<span className="text-2xs tracking-[0.3em] text-muted-foreground uppercase">
				final scores
			</span>

			<div className="mt-4 flex items-end justify-center gap-2">
				{podium.map((place) => {
					const player = ranked[place - 1];
					// A room of two has no third place, and a podium should not
					// invent one to stand a block on.
					if (!player) return null;

					return (
						<Step
							key={player.id}
							place={place}
							player={player}
							ink={inkFor(inks, player.name)}
						/>
					);
				})}
			</div>

			{rest.length > 0 ? (
				<ul className="mt-4 flex max-h-24 w-full flex-col gap-0.5 overflow-y-auto px-4">
					{rest.map((player, index) => (
						<li
							key={player.id}
							data-also
							className="flex items-baseline justify-between gap-3 text-2xs text-muted-foreground"
						>
							<span className="min-w-0 truncate">
								<span className="tabular-nums">{index + 4}.</span> {player.name}
								{player.self ? " (you)" : ""}
							</span>
							<span className="shrink-0 tabular-nums">{player.score}</span>
						</li>
					))}
				</ul>
			) : null}

			<p className="mt-4 text-2xs text-muted-foreground">
				back to the lobby in a moment
			</p>
		</output>
	);
}

/** One place on the podium: who stood there, and the block they stood on. */
function Step({
	place,
	player,
	ink,
}: {
	place: Place;
	player: Player;
	ink: string;
}) {
	const won = place === 1;

	return (
		<div className="flex w-20 flex-col items-center gap-1.5">
			<div
				data-topper={place}
				className="flex flex-col items-center gap-1 text-center"
			>
				{/*
					Reserved whether or not it is filled, so the two runners-up are
					not half a crown taller than the winner while it drops in.
				*/}
				<span className="flex h-4 items-end">
					{won ? (
						<CrownIcon data-crown aria-hidden className="size-4 text-ink-2" />
					) : null}
				</span>

				<Avatar size={won ? "lg" : "default"}>
					<AvatarFallback
						style={{ backgroundColor: ink }}
						className="font-medium text-white uppercase"
					>
						{player.name.slice(0, 1)}
					</AvatarFallback>
				</Avatar>

				<span
					className={cn(
						"w-full truncate text-2xs font-medium",
						won && "text-xs",
					)}
				>
					{player.name}
					{player.self ? (
						<span className="font-normal text-muted-foreground"> (you)</span>
					) : null}
				</span>

				<span
					data-score={player.score}
					data-place={place}
					className={cn(
						"text-2xs text-muted-foreground tabular-nums",
						won && "text-xs font-medium text-foreground",
					)}
				>
					{player.score}
				</span>
			</div>

			<div
				data-plinth={place}
				style={{
					height: PLINTH[place],
					// The block is the player's own colour, thinned until it is a
					// surface rather than a second avatar competing with the first.
					backgroundColor: `color-mix(in oklab, ${ink} 22%, transparent)`,
					borderTopColor: ink,
				}}
				className="flex w-full origin-bottom items-start justify-center rounded-t-md border-t-2 pt-1"
			>
				<span
					aria-hidden
					className="text-2xs font-medium text-muted-foreground tabular-nums"
				>
					{place}
				</span>
			</div>
		</div>
	);
}
