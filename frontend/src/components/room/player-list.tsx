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
  /** Already sorted by score, highest first. */
  players: Player[];
  /** The room's colours, keyed by name. Shared with the chat. */
  inks: InkMap;
  className?: string;
};

export function PlayerList({ players, inks, className }: PlayerListProps) {
  return (
    <Card size="sm" className={cn("flex min-h-0 flex-col", className)}>
      <CardContent className="min-h-0 flex-1 px-1">
        <ScrollArea className="h-full">
          <ul className="flex flex-col gap-0.5 px-1">
            {players.map((player, i) => (
              <PlayerRow
                key={player.id}
                player={player}
                rank={i + 1}
                ink={inkFor(inks, player.name)}
              />
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function PlayerRow({
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
      <span className="text-muted-foreground w-4 shrink-0 text-center text-2xs tabular-nums">
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
            <span className="text-muted-foreground shrink-0 font-normal">
              (you)
            </span>
          ) : null}
        </div>
        <span className="text-muted-foreground flex items-center gap-1 text-2xs">
          {guessed ? (
            <>
              <CheckIcon className="text-primary size-2.5 shrink-0" />
              <span className="text-primary">guessed</span>
            </>
          ) : drawing ? (
            <>
              <PencilIcon className="size-2.5 shrink-0 text-(color:--ink)" />
              <span className="text-(color:--ink)">drawing</span>
            </>
          ) : (
            "guessing…"
          )}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="text-xs font-medium tabular-nums">{score}</span>
        {gained === null ? null : (
          <span className="text-primary text-2xs tabular-nums">+{gained}</span>
        )}
      </div>
    </li>
  );
}
