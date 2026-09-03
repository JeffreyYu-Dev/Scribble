/**
 * The shelf: every game the room could play, and nothing else.
 *
 * This is a whole screen rather than a panel, because reaching for it lifts the
 * room away — the invite bar and the roster go up with everything else, and for
 * as long as it is open the picker is all there is. That is also why it carries
 * its own way out: there is no room chrome left to click.
 */

import { ChevronDownIcon, LockIcon } from "lucide-react";

import { GameArt } from "#/components/room/game-art.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import type { MiniGame } from "#/lib/room/games.ts";
import { PLACEHOLDER_SLOTS } from "#/lib/room/games.ts";
import { cn } from "#/lib/utils.ts";

type GamePickerProps = {
  games: MiniGame[];
  selected: MiniGame;
  /** Only the host picks; everyone else is here to see what is on offer. */
  hosting: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function GamePicker({
  games,
  selected,
  hosting,
  onSelect,
  onClose,
}: GamePickerProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <header className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-sm font-medium">Choose a game</h2>
          <p className="text-2xs text-muted-foreground">
            {hosting
              ? "Picking one takes the room back down."
              : "The host decides — this is what they are choosing from."}
          </p>
        </div>
        {/*
					Picking a game closes the shelf on its own; this is the way back
					for somebody who opened it and changed their mind.
				*/}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to the lobby"
          onClick={onClose}
        >
          <ChevronDownIcon />
        </Button>
      </header>

      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        <div className="grid grid-cols-2 gap-3 pb-px sm:grid-cols-3 xl:grid-cols-4">
          {games.map((game) => (
            <GameTile
              key={game.id}
              game={game}
              selected={game.id === selected.id}
              disabled={!hosting || !game.ready}
              onSelect={() => onSelect(game.id)}
            />
          ))}
          {Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the slots are positional and identical
            <EmptySlot key={i} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function GameTile({
  game,
  selected,
  disabled,
  onSelect,
}: {
  game: MiniGame;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative isolate flex aspect-2/1 flex-col justify-end overflow-hidden rounded-lg bg-card p-2.5 text-left ring-1 ring-foreground/10 transition-shadow",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // The selected tile keeps its ring at rest; the rest only light up
        // under the cursor, so the room's choice is the one thing marked.
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
