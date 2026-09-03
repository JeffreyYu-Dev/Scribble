import { UsersIcon } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import type { MiniGame } from "#/lib/room/games.ts";
import { cn } from "#/lib/utils.ts";

type RoomSummaryProps = {
  game: MiniGame;
  players: number;
  maxPlayers: number;
  /** Whether the local player is the one who can start the room. */
  hosting: boolean;
  className?: string;
};

/**
 * What the room is about to play, and who it is waiting on. It sits above the
 * roster in the lobby and goes away once a game starts, by which point the top
 * bar is saying all of this in more detail.
 */
export function RoomSummary({
  game,
  players,
  maxPlayers,
  hosting,
  className,
}: RoomSummaryProps) {
  const full = players >= maxPlayers;
  const short = players < game.players.min;

  return (
    <Card size="sm" className={cn("shrink-0", className)}>
      <CardContent className="flex items-center gap-2.5">
        <span
          style={{ "--accent": game.accent } as React.CSSProperties}
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-(--accent)/15 text-accent"
        >
          <game.icon className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-heading text-xs font-medium">
            {game.name}
          </span>
          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
            <UsersIcon className="size-2.5 shrink-0" />
            <span className="tabular-nums">
              {players}/{maxPlayers}
            </span>
            {/*
							Only ever one of these: a room that is short of players
							cannot also be full.
						*/}
            {short ? (
              <span>&middot; needs {game.players.min - players} more</span>
            ) : full ? (
              <span>&middot; full</span>
            ) : null}
          </span>
        </div>

        {hosting ? (
          <Badge variant="outline" className="shrink-0">
            host
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
