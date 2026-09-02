import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "#/components/room/chat-panel.tsx";
import { DrawingBoard } from "#/components/room/drawing-board.tsx";
import { PlayerList } from "#/components/room/player-list.tsx";
import { RoomHeader } from "#/components/room/room-header.tsx";
import { RoomProvider, useRoom } from "#/components/room/room-provider.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { TOTAL_ROUNDS, TURN_SECONDS } from "#/lib/room/constants.ts";
import { inkMap } from "#/lib/room/ink.ts";
import {
  MOCK_CHAT,
  MOCK_PLAYERS,
  MOCK_REVEALED,
  MOCK_WORD,
} from "#/lib/room/mock.ts";
import { roomCodeSchema } from "#/lib/schemas.ts";

/** `scribble` is absent for the placeholder room, so the search is optional. */
type RoomSearch = { scribble?: string };

/** Stands in for a real code while the placeholder room is on screen. */
const DEMO_CODE = "DEMO";

export const Route = createFileRoute("/room")({
  validateSearch: (search: Record<string, unknown>): RoomSearch => {
    const scribble =
      typeof search.scribble === "string" ? search.scribble.trim() : "";
    // Dropping the key entirely (rather than keeping an empty string) is what
    // keeps a bare visit on `/room` instead of bouncing it to `/room?scribble=`.
    return scribble ? { scribble: scribble.toUpperCase() } : {};
  },
  // A redirect is all a loader can safely do here: this runs on the server for
  // the first request, so the socket has to wait for the client. Sending a
  // junk code home saves opening a connection that could only be refused. No
  // code at all is not junk — that is the placeholder, and it stays put.
  beforeLoad: ({ search }) => {
    if (
      search.scribble !== undefined &&
      !roomCodeSchema.safeParse(search.scribble).success
    ) {
      throw redirect({ to: "/" });
    }
  },
  component: RoomRoute,
});

function RoomRoute() {
  const { scribble } = Route.useSearch();

  // Without a code there is nothing to join, so the room renders as a still
  // life off the mock data: no socket, no server, just the layout.
  if (!scribble) return <Room code={DEMO_CODE} />;

  // Keyed by code so switching rooms rebuilds the provider (and its socket)
  // instead of reusing one pointed at the old room.
  return (
    <RoomProvider key={scribble} code={scribble}>
      <RoomGate />
    </RoomProvider>
  );
}

/**
 * The room is only worth rendering once the server has us in it: until the join
 * is acknowledged there is no player id, and after a close the panels would be
 * showing a room we are no longer in.
 */
function RoomGate() {
  const { code, status, error, retry } = useRoom();
  const navigate = useNavigate();

  if (status === "joined") return <Room code={code} />;

  const closed = status === "closed";

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            {closed ? "Room unavailable" : "Joining the room"}
          </EmptyTitle>
          <EmptyDescription>
            {closed
              ? (error ?? "The connection dropped.")
              : "Connecting to the server\u2026"}
          </EmptyDescription>
        </EmptyHeader>
        {closed ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back home
            </Button>
            <Button onClick={retry}>Try again</Button>
          </div>
        ) : null}
      </Empty>
    </main>
  );
}

/**
 * Everything stacked above and below the board: page padding, the header, the
 * toolbar and the two gaps between them. The board's width is derived from the
 * height left over once this is taken out, which is why the toolbar scrolls
 * sideways rather than wrapping — a second toolbar row would invalidate it.
 * It is rounded up a little: coming in under the viewport leaves a sliver of
 * unused floor, where coming in over it would crop the toolbar.
 */
const ROOM_CHROME = "10rem";

/**
 * The room is laid out for a 16:9 screen and stops growing either side of one:
 * past this width the extra pixels only inflate the side panels, and past this
 * height they only inflate the board. Beyond either the room holds its size and
 * sits in the middle of the page instead. The height clears a 1080p viewport,
 * which is why an ordinary 16:9 monitor never meets it.
 */
const ROOM_MAX_W = "120rem";
const ROOM_MAX_H = "68rem";

/**
 * The widest 4:3 board whose height still clears the fixed furniture above and
 * below it. Taken from the room's height rather than the viewport's so a tall
 * screen stops feeding the board once the room has stopped growing — and since
 * the board is what the row is measured against, this is the room's own height
 * cap as well.
 */
const BOARD_W =
  "calc((min(100svh, var(--room-max-h)) - var(--room-chrome)) * 4 / 3)";

function Room({ code }: { code: string }) {
  const navigate = useNavigate();

  // TODO: placeholder clock. The server owns the turn timer; this only keeps
  // the ring moving so the layout can be judged in motion.
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((left) => (left > 0 ? left - 1 : TURN_SECONDS));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const players = useMemo(
    () => [...MOCK_PLAYERS].sort((a, b) => b.score - a.score),
    [],
  );
  // Built from the unsorted list: colours follow join order, so nobody's
  // changes colour when the scoreboard reshuffles.
  const inks = useMemo(() => inkMap(MOCK_PLAYERS), []);
  const drawer = players.find((player) => player.status === "drawing");
  const you = players.find((player) => player.self);
  const drawing = drawer?.self ?? false;

  return (
    <div
      style={
        {
          "--room-chrome": ROOM_CHROME,
          "--room-max-w": ROOM_MAX_W,
          "--room-max-h": ROOM_MAX_H,
          "--board-w": BOARD_W,
        } as React.CSSProperties
      }
      className="type-compact flex min-h-svh justify-center p-2 lg:h-svh lg:items-center"
    >
      {/*
				The room proper. It is as tall as the board makes it and no
				taller, so whatever a bigger screen has left over stays outside
				this box as margin rather than stretching the panels.
			*/}
      <div className="flex w-full max-w-(--room-max-w) flex-col gap-2">
        <RoomHeader
          code={code}
          round={2}
          totalRounds={TOTAL_ROUNDS}
          secondsLeft={secondsLeft}
          turnSeconds={TURN_SECONDS}
          word={MOCK_WORD}
          revealed={MOCK_REVEALED}
          drawing={drawing}
          drawerName={drawer?.name ?? "nobody"}
          onLeave={() => navigate({ to: "/" })}
        />

        {/*
					A row, not a grid: the board is sized by the height available
					to it, so whatever width is left over is handed to the side
					panels (`grow`) instead of becoming dead margin either side of
					the board — which is also what keeps the row exactly as wide as
					the header above it.

					The row takes its height from the board rather than from the
					page, so the panels end where the toolbar ends. Any height the
					board did not claim is left below the room, not inside it.
				*/}
        <main className="flex min-h-0 flex-col gap-2 lg:flex-row lg:items-stretch">
          <PlayerList
            players={players}
            inks={inks}
            className="max-h-64 lg:max-h-none lg:shrink-0 lg:grow lg:basis-56"
          />

          {/*
						Board and toolbar share one column, so they always line up,
						and this is the only track that shrinks once the row runs
						out of room — the panels hold their width and the board
						gives up the difference.
					*/}
          <DrawingBoard disabled={!drawing} className="lg:w-(--board-w)" />

          <ChatPanel
            entries={MOCK_CHAT}
            inks={inks}
            canGuess={!drawing && you?.status !== "guessed"}
            className="h-80 lg:h-auto lg:shrink-0 lg:grow lg:basis-68"
          />
        </main>
      </div>
    </div>
  );
}
