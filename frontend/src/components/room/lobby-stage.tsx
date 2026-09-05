/**
 * The lobby: the shelf of games, and the one the room has landed on.
 *
 * Both are the same stage rather than two screens. A room that has not picked
 * yet sees the shelf and nothing else; picking a game grows that tile until it
 * is the stage, and the shelf goes with it. Going back the other way puts the
 * tile down where it was taken from, which is the whole reason the movement is
 * worth animating: the big panel and the small tile are the same object, and
 * the room should never have to work out which tile it just came out of.
 *
 * The selection itself is a room-level decision, so nothing is decided here:
 * the stage is handed the room's pick and reports the tile that was clicked.
 * Which player is allowed to click arrives as `hosting`.
 */

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
	ArrowRightIcon,
	LayoutGridIcon,
	LockIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GameArt } from "#/components/room/game-art.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import type { MiniGame } from "#/lib/room/games.ts";
import { PLACEHOLDER_SLOTS } from "#/lib/room/games.ts";
import { cn } from "#/lib/utils.ts";

/**
 * How long the tile takes to become the stage, and to go back to being a tile.
 * Growing is the slower of the two because it is the half the room is asked to
 * follow; collapsing is a dismissal and only has to get out of the way.
 */
const GROW = 0.55;
const SHRINK = 0.42;

/** How long the shelf takes to leave once something has been picked off it. */
const FADE = 0.2;

/**
 * Everything on the panel that is not the panel itself: the writing and the way
 * back. None of it is part of the tile the panel grew out of, so it is faded in
 * once the growing is nearly done, and taken away first on the way back.
 */
const COPY = ".lobby-copy";

type LobbyStageProps = {
	games: MiniGame[];
	/** The room's pick, or nothing yet — in which case the shelf is all there is. */
	selected: MiniGame | null;
	/** A tile was clicked. Whether that sticks is the room's call, not ours. */
	onSelect: (id: string) => void;
	onContinue: () => void;
	/** Only the host picks the game and moves the room on. */
	hosting: boolean;
};

export function LobbyStage({
	games,
	selected,
	onSelect,
	onContinue,
	hosting,
}: LobbyStageProps) {
	/**
	 * Whether the pick is filling the stage. Separate from having a pick at all:
	 * a room can go back to the shelf to look around without giving up the game
	 * it has already chosen, which is what keeps that tile marked while it does.
	 */
	const [open, setOpen] = useState(selected !== null);

	// A pick that arrives from outside — the host choosing, once the server
	// carries the choice — brings the stage up on its own. Clicks do it for
	// themselves below, since re-picking the game the room is already on would
	// not change this and so would never be seen.
	useEffect(() => {
		if (selected) setOpen(true);
	}, [selected]);

	const stage = useRef<HTMLDivElement>(null);
	const shelf = useRef<HTMLDivElement>(null);
	const hero = useRef<HTMLDivElement>(null);
	/** Every tile on the shelf, so the one being grown can be measured. */
	const tiles = useRef(new Map<string, HTMLElement>());
	/** The first pass sets the stage rather than animating into it. */
	const opening = useRef(true);

	const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

	useGSAP(
		() => {
			const floor = stage.current;
			const grid = shelf.current;
			if (!floor || !grid) return;

			const instant = opening.current || reduced;
			opening.current = false;

			// Nothing picked: there is no panel to move, only a shelf to show.
			const panel = hero.current;
			if (!panel) {
				gsap.set(grid, { autoAlpha: 1 });
				return;
			}

			const copy = Array.from(panel.querySelectorAll(COPY));

			// Somebody who picks and changes their mind inside half a second
			// deserves to be followed rather than argued with: whatever was
			// still running is dropped where it stands, and the timeline built
			// below carries on from there.
			gsap.killTweensOf([panel, grid, ...copy]);

			/**
			 * Where the panel grows from, and shrinks back to: the tile standing
			 * for the same game, in the stage's own coordinates. A hidden shelf
			 * still has its layout, so this reads the same either way. Should the
			 * tile be missing — a game dropped from the shelf while the room is
			 * on it — the panel falls back to the middle of the stage.
			 */
			const tileBox = () => {
				const floorBox = floor.getBoundingClientRect();
				const tile = selected ? tiles.current.get(selected.id) : null;
				if (!tile) {
					return {
						x: floorBox.width / 4,
						y: floorBox.height / 4,
						width: floorBox.width / 2,
						height: floorBox.height / 2,
					};
				}
				const box = tile.getBoundingClientRect();
				return {
					x: box.left - floorBox.left,
					y: box.top - floorBox.top,
					width: box.width,
					height: box.height,
				};
			};

			if (instant) {
				gsap.set(panel, {
					autoAlpha: open ? 1 : 0,
					clearProps: "x,y,width,height",
				});
				gsap.set(copy, { autoAlpha: 1 });
				gsap.set(grid, { autoAlpha: open ? 0 : 1 });
				return;
			}

			const timeline = gsap.timeline();

			if (open) {
				const floorBox = floor.getBoundingClientRect();
				timeline
					.set(panel, { ...tileBox(), autoAlpha: 1 })
					.set(copy, { autoAlpha: 0 })
					.to(grid, { autoAlpha: 0, duration: FADE, ease: "power2.in" }, 0)
					.to(
						panel,
						{
							x: 0,
							y: 0,
							width: floorBox.width,
							height: floorBox.height,
							duration: GROW,
							ease: "power3.inOut",
							// Handed back to the stylesheet at the end, so a window
							// resized later still finds the panel filling the stage.
							clearProps: "x,y,width,height",
						},
						0,
					)
					// The writing is not part of the tile, so it arrives once the
					// panel is most of the way to being a panel.
					.to(
						copy,
						{ autoAlpha: 1, duration: 0.3, ease: "power2.out" },
						GROW * 0.5,
					);
				return;
			}

			timeline
				.to(copy, { autoAlpha: 0, duration: 0.15, ease: "power2.in" }, 0)
				.to(
					panel,
					{
						...tileBox(),
						autoAlpha: 0,
						duration: SHRINK,
						ease: "power3.inOut",
					},
					0,
				)
				.to(
					grid,
					{ autoAlpha: 1, duration: 0.3, ease: "power2.out" },
					SHRINK * 0.35,
				);
		},
		{ dependencies: [open, selected, reduced], scope: stage },
	);

	return (
		<div
			ref={stage}
			className="relative isolate min-h-72 flex-1 overflow-hidden"
		>
			<div ref={shelf} className="size-full overflow-y-auto">
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{games.map((game) => (
						<GameTile
							key={game.id}
							ref={(node) => {
								if (node) tiles.current.set(game.id, node);
								else tiles.current.delete(game.id);
							}}
							game={game}
							selected={game.id === selected?.id}
							disabled={!hosting || !game.ready}
							onSelect={() => {
								onSelect(game.id);
								setOpen(true);
							}}
						/>
					))}
					{Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the slots are positional and identical
						<EmptySlot key={i} />
					))}
				</div>
			</div>

			{selected ? (
				<section
					ref={hero}
					// Hidden until the animation says otherwise: the panel is only
					// ever built as the result of a pick, and the pick is what shows
					// it — see the first pass above for the case where a room
					// arrives with one already made.
					style={{ visibility: "hidden", opacity: 0 }}
					className="absolute top-0 left-0 isolate flex size-full flex-col justify-end overflow-hidden rounded-lg bg-card p-4 ring-1 ring-foreground/10"
				>
					<GameArt game={selected} className="absolute inset-0 -z-10" />

					<div className="lobby-copy flex items-end justify-between gap-4">
						<div className="flex min-w-0 flex-col gap-1">
							<div className="flex items-center gap-2">
								<h2 className="font-heading text-base font-medium">
									{selected.name}
								</h2>
								<Badge variant="outline" className="gap-1">
									<UsersIcon className="size-2.5" />
									{selected.players.min}&ndash;{selected.players.max}
								</Badge>
							</div>
							<p className="text-xs text-muted-foreground">
								{selected.tagline}
							</p>
							<p className="max-w-prose text-2xs text-muted-foreground/80">
								{selected.description}
							</p>
						</div>

						<div className="flex shrink-0 flex-col items-end gap-1.5">
							{hosting ? null : (
								<span className="text-2xs text-muted-foreground">
									the host picks
								</span>
							)}
							<Button
								onClick={onContinue}
								disabled={!hosting || !selected.ready}
							>
								Continue
								<ArrowRightIcon data-icon="inline-end" />
							</Button>
						</div>
					</div>

					{/*
						The way back to the shelf, and the only one: picking is the
						only thing that brought the panel up.
					*/}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setOpen(false)}
						className="lobby-copy absolute top-3 left-3"
					>
						<LayoutGridIcon data-icon="inline-start" />
						All games
					</Button>
				</section>
			) : null}
		</div>
	);
}

function GameTile({
	ref,
	game,
	selected,
	disabled,
	onSelect,
}: {
	ref: React.Ref<HTMLButtonElement>;
	game: MiniGame;
	selected: boolean;
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			ref={ref}
			type="button"
			onClick={onSelect}
			disabled={disabled}
			aria-pressed={selected}
			className={cn(
				"group relative isolate flex aspect-2/1 flex-col justify-end overflow-hidden rounded-lg bg-card p-2.5 text-left ring-1 ring-foreground/10 transition-shadow",
				"focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
				// The room's own game keeps its ring at rest; the rest only light
				// up under the cursor, so the choice already made is the one thing
				// the shelf marks.
				selected
					? "ring-2 ring-primary"
					: "not-disabled:hover:ring-2 not-disabled:hover:ring-foreground/25",
				disabled && !game.ready && "opacity-60",
			)}
		>
			<GameArt game={game} className="absolute inset-0 -z-10" />

			<div className="flex min-w-0 items-center gap-1.5">
				<game.icon
					style={{ "--accent": game.accent } as React.CSSProperties}
					className="size-3 shrink-0 text-accent"
				/>
				<span className="truncate text-xs font-medium">{game.name}</span>
				{game.ready ? null : (
					<Badge variant="outline" className="ml-auto shrink-0 gap-1">
						<LockIcon className="size-2.5" />
						soon
					</Badge>
				)}
			</div>
		</button>
	);
}

/**
 * A place on the shelf with nothing on it yet. Drawn rather than left out so
 * the grid keeps its shape while the set of games is still small.
 */
function EmptySlot() {
	return (
		<div
			aria-hidden
			className="flex aspect-2/1 items-center justify-center rounded-lg border border-dashed border-foreground/10 bg-muted/20"
		>
			<span className="text-2xs text-muted-foreground/50">soon</span>
		</div>
	);
}
