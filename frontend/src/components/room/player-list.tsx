import gsap from "gsap";
import { CheckIcon, CrownIcon, PencilIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
} from "#/components/ui/avatar.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import type { InkMap } from "#/lib/room/ink.ts";
import { inkFor } from "#/lib/room/ink.ts";
import type { Player } from "#/lib/room/types.ts";
import { cn } from "#/lib/utils.ts";

/**
 * The measure has to be taken before the browser paints the new order, and this
 * app server-renders, where there is no paint and no layout to measure. Same
 * hook either side, chosen once.
 */
const useMeasure = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
	const list = useRef<HTMLUListElement>(null);
	const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

	// The scoreboard ranks; the roster keeps join order, which is the order the
	// room filled up in and the order the colours were handed out.
	const ordered =
		variant === "game"
			? [...players].sort((a, b) => b.score - a.score)
			: players;

	useRankSlide(list, reduced);

	return (
		<Card size="sm" className={cn("flex min-h-0 flex-col", className)}>
			<CardContent className="min-h-0 flex-1 px-1">
				<ScrollArea className="h-full">
					<ul ref={list} className="flex flex-col gap-0.5 px-1">
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
 * Slides each row from where it was to where it now is.
 *
 * The scoreboard reorders the instant a guess lands, and a row that teleports
 * past another says nothing about what happened. Overtaking is most of the
 * drama of a round and it is over inside one frame, so the rows are put back
 * where they were and animated to where they belong: the layout is never
 * fought, only the paint.
 *
 * Measured with `offsetTop` rather than a bounding rect, which matters twice
 * over. It is the row's laid-out position, so a transform does not move it —
 * a row caught mid-slide still reports where it truly belongs, and the next
 * reorder measures from there rather than from wherever it had got to. And it
 * is unaffected by scrolling, so a rail scrolled halfway down a full room does
 * not read every row as having jumped.
 *
 * There is no dependency array on purpose: every commit is a chance the order
 * changed, and the positions have to stay current even for the commits where
 * it did not.
 */
function useRankSlide(
	list: React.RefObject<HTMLUListElement | null>,
	reduced: boolean,
) {
	const previous = useRef(new Map<string, number>());

	useMeasure(() => {
		const root = list.current;
		if (!root) return;

		const rows = Array.from(
			root.querySelectorAll<HTMLElement>("[data-player]"),
		);

		const now = new Map<string, number>();
		for (const row of rows) now.set(row.dataset.player ?? "", row.offsetTop);

		if (!reduced) {
			for (const row of rows) {
				const id = row.dataset.player ?? "";
				const was = previous.current.get(id);
				const top = now.get(id) ?? 0;

				// A row that was not there a moment ago has not moved: it arrived,
				// and arriving is a different thing to show.
				if (was === undefined) {
					gsap.fromTo(
						row,
						{ autoAlpha: 0, x: -8 },
						{ autoAlpha: 1, x: 0, duration: 0.3, ease: "power2.out" },
					);
					continue;
				}

				const travelled = was - top;
				// Sub-pixel drift is not a move, and animating it would leave rows
				// permanently twitching against the layout.
				if (Math.abs(travelled) < 1) continue;

				// Where the row has got to, if it is still sliding from the last
				// time it was passed. Added to the distance so the new slide starts
				// from what is on screen rather than from where the row would have
				// been had it already arrived — without this a player overtaken
				// twice in a second visibly snaps back before setting off again.
				const sliding = Number(gsap.getProperty(row, "y")) || 0;

				gsap.fromTo(
					row,
					{ y: travelled + sliding },
					{
						y: 0,
						duration: 0.45,
						ease: "power3.out",
						// A row overtaken twice in quick succession slides once, from
						// wherever it had reached, instead of stacking two tweens.
						overwrite: "auto",
					},
				);

				// Upwards is the only direction worth marking. Everyone a riser
				// passes moves down by exactly as much, and lighting all of them
				// would say the whole board had changed rather than one player.
				if (travelled > 0) {
					const rise = row.querySelector("[data-rise]");
					if (rise) {
						gsap.fromTo(
							rise,
							{ autoAlpha: 1 },
							{ autoAlpha: 0, duration: 0.9, ease: "power2.out" },
						);
					}
				}
			}
		}

		previous.current = now;
	});
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
			data-player={player.id}
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
			data-player={player.id}
			style={{ "--ink": ink } as React.CSSProperties}
			className={cn(
				// `isolate` is what lets the mark below sit between the row's own
				// background and its contents rather than over the top of them.
				"relative isolate flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors",
				// Green marks the word being found, whoever found it.
				guessed && "bg-primary/15",
				!guessed && (drawing || self) && "bg-muted/60",
			)}
		>
			{/*
				Lit for a moment when this row gains a place, and invisible the
				rest of the time. It is a wash behind the row rather than a change
				to the row itself, so it can be faded out from under a player who
				is also, say, being marked as having guessed.
			*/}
			<span
				data-rise
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 rounded-md bg-primary/25 opacity-0"
			/>

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
