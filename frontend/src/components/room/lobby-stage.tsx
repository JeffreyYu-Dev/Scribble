/**
 * The lobby: the game the room is about to play, with the floor to itself.
 *
 * The shelf of other games is not here. It is a screen of its own, parked below
 * the whole room — see `game-picker.tsx` and the lift in `room-shell.tsx`. All
 * this stage owns is the handle that asks for it.
 *
 * The selection is a room-level decision, so nothing is chosen here either: the
 * stage is handed a game and reports nothing back but the two things a player
 * can ask of it. Which player is allowed to ask arrives as `hosting`.
 */

import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { useRef } from "react";

import { GameArt } from "#/components/room/game-art.tsx";
import { PickerDock } from "#/components/room/picker-dock.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { MiniGame } from "#/lib/room/games.ts";

type LobbyStageProps = {
	selected: MiniGame;
	onContinue: () => void;
	/** Asks for the shelf, which lifts the room out of the way to show it. */
	onOpenPicker: () => void;
	/** True while the shelf is up: this pane is off screen and its dock idle. */
	lifted: boolean;
	/** Only the host picks the game and moves the room on. */
	hosting: boolean;
};

/**
 * The game the room has landed on, at the size it deserves. The art fills the
 * pane and everything readable sits along the bottom of it, which is where a
 * background is least likely to fight with the text over it.
 */
export function LobbyStage({
	selected,
	onContinue,
	onOpenPicker,
	lifted,
	hosting,
}: LobbyStageProps) {
	// The panel is what the dock measures the cursor against: its bottom edge is
	// the edge the handle rises from.
	const panel = useRef<HTMLElement>(null);

	return (
		<section
			ref={panel}
			className="relative isolate flex min-h-72 flex-1 flex-col justify-end overflow-hidden rounded-lg bg-card p-4 ring-1 ring-foreground/10"
		>
			<GameArt game={selected} className="absolute inset-0 -z-10" />

			<div className="flex items-end justify-between gap-4">
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
					<p className="text-xs text-muted-foreground">{selected.tagline}</p>
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
					<Button onClick={onContinue} disabled={!hosting || !selected.ready}>
						Continue
						<ArrowRightIcon data-icon="inline-end" />
					</Button>
				</div>
			</div>

			<PickerDock area={panel} armed={!lifted} onOpen={onOpenPicker} />
		</section>
	);
}
