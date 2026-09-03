import { CheckIcon, CrownIcon, PencilIcon } from "lucide-react";

import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
} from "#/components/ui/avatar.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import type { InkMap } from "#/lib/room/ink.ts";
import { inkFor } from "#/lib/room/ink.ts";
import type { Player } from "#/lib/room/types.ts";
import { cn } from "#/lib/utils.ts";

type PlayerListProps = {
	/** In join order. The list puts them in the order its variant wants. */
	players: Player[];
	/** The room's colours, keyed by name. Shared with the chat. */
	inks: InkMap;
	/**
	 * A lobby has no scores and nobody holding a pen, so its list is a roster:
	 * who is in the room, and nothing that has not happened yet. `game` is the
	 * scoreboard — rank, points, and where each player is in the turn.
	 */
	variant?: "lobby" | "game";
	className?: string;
};

export function PlayerList({
	players,
	inks,
	variant = "game",
	className,
}: PlayerListProps) {
	// The scoreboard ranks; the roster keeps join order, which is the order the
	// room filled up in and the order the colours were handed out.
	const ordered =
		variant === "game"
			? [...players].sort((a, b) => b.score - a.score)
			: players;

	return (
		<Card size="sm" className={cn("flex min-h-0 flex-col", className)}>
			<CardContent className="min-h-0 flex-1 px-1">
				<ScrollArea className="h-full">
					<ul className="flex flex-col gap-0.5 px-1">
						{ordered.map((player, i) =>
							variant === "game" ? (
								<ScoreRow
									key={player.id}
									player={player}
									rank={i + 1}
									ink={inkFor(inks, player.name)}
								/>
							) : (
								<RosterRow
									key={player.id}
									player={player}
									ink={inkFor(inks, player.name)}
								/>
							),
						)}
					</ul>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}

/**
 * A player in the lobby: their colour, their initial, their name, and a crown
 * if the room is theirs. Nothing else is true yet — a score of zero and a
 * status of "guessing" are both answers to questions the room has not asked.
 */
function RosterRow({ player, ink }: { player: Player; ink: string }) {
	const { name, self, host } = player;

	return (
		<li
			className={cn(
				"flex items-center gap-2.5 rounded-md px-1.5 py-2",
				self && "bg-muted/60",
			)}
		>
			<Avatar>
				<AvatarFallback
					style={{ backgroundColor: ink }}
					className="font-medium text-white uppercase"
				>
					{name.slice(0, 1)}
				</AvatarFallback>
				{/*
					Pinned to the avatar rather than set beside the name, so it
					belongs to the face and costs the name none of its width. The
					halo is the ring, the same way `AvatarBadge` lifts itself off
					whatever colour the player is wearing.
				*/}
				{host ? (
					<span
						role="img"
						aria-label="Host"
						className="absolute -bottom-0.5 -left-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-background text-ink-2 ring-2 ring-background"
					>
						<CrownIcon aria-hidden className="size-2.5" />
					</span>
				) : null}
			</Avatar>

			<span className="min-w-0 flex-1 truncate text-xs font-medium">
				{name}
			</span>

			{self ? (
				<span className="shrink-0 text-2xs text-muted-foreground">you</span>
			) : null}
		</li>
	);
}

/** A player mid-game, where the score and the status are the point of the row. */
function ScoreRow({
	player,
	rank,
	ink,
}: {
	player: Player;
	rank: number;
	ink: string;
}) {
	const { name, score, gained, status, self } = player;
	const guessed = status === "guessed";
	const drawing = status === "drawing";

	return (
		<li
			style={{ "--ink": ink } as React.CSSProperties}
			className={cn(
				"flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors",
				// Green marks the word being found, whoever found it.
				guessed && "bg-primary/15",
				!guessed && (drawing || self) && "bg-muted/60",
			)}
		>
			<span className="w-4 shrink-0 text-center text-2xs text-muted-foreground tabular-nums">
				{rank === 1 ? (
					<CrownIcon
						aria-label="Leading"
						className="mx-auto size-3 text-ink-2"
					/>
				) : (
					rank
				)}
			</span>

			<Avatar size="sm">
				<AvatarFallback
					style={{ backgroundColor: ink }}
					className="font-medium text-white uppercase"
				>
					{name.slice(0, 1)}
				</AvatarFallback>
				{drawing ? <AvatarBadge /> : null}
			</Avatar>

			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex min-w-0 items-center gap-1 text-xs font-medium">
					<span className="truncate">{name}</span>
					{self ? (
						<span className="shrink-0 font-normal text-muted-foreground">
							(you)
						</span>
					) : null}
				</div>
				<span className="flex items-center gap-1 text-2xs text-muted-foreground">
					{guessed ? (
						<>
							<CheckIcon className="size-2.5 shrink-0 text-primary" />
							<span className="text-primary">guessed</span>
						</>
					) : drawing ? (
						<>
							<PencilIcon className="size-2.5 shrink-0 text-(--ink)" />
							<span className="text-(--ink)">drawing</span>
						</>
					) : (
						"guessing…"
					)}
				</span>
			</div>

			<div className="flex shrink-0 flex-col items-end">
				<span className="text-xs font-medium tabular-nums">{score}</span>
				{gained === null ? null : (
					<span className="text-2xs text-primary tabular-nums">+{gained}</span>
				)}
			</div>
		</li>
	);
}
