/**
 * The backdrop a game wears, on its tile and on the stage panel above it.
 *
 * Every game will eventually carry its own artwork; until one does, this fills
 * the space with a flat wash of the game's accent, so the shelf reads as a set
 * of distinct places rather than as a grid of empty cards. Both cases go
 * through here, so swapping a wash for a painting is one field on the record.
 */

import type { MiniGame } from "#/lib/room/games.ts";
import { cn } from "#/lib/utils.ts";

export function GameArt({
	game,
	className,
}: {
	game: MiniGame;
	className?: string;
}) {
	if (game.art) {
		return (
			<img
				src={game.art}
				alt=""
				aria-hidden
				className={cn("size-full object-cover", className)}
			/>
		);
	}

	return (
		<div
			aria-hidden
			// Mixed into the card rather than laid over it at an opacity, so the
			// wash is one flat colour in both themes and the text above it needs
			// nothing between them to stay readable.
			style={{
				backgroundColor: `color-mix(in oklab, ${game.accent} 12%, var(--card))`,
			}}
			className={cn("size-full", className)}
		/>
	);
}
