import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { JoinGate } from "#/components/room/join-gate.tsx";
import { RoomLayout } from "#/components/room/room-layout.tsx";
import {
  RoomProvider,
  useCanvas,
  useChat,
  usePlayers,
  useRoom,
  useSettings,
  useTurn,
} from "#/components/room/room-provider.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { useCountdown } from "#/hooks/use-countdown.ts";
import { TOTAL_ROUNDS, TURN_SECONDS } from "#/lib/room/constants.ts";
import {
  MOCK_CHAT,
  MOCK_PLAYERS,
  MOCK_REVEALED,
  MOCK_WORD,
} from "#/lib/room/mock.ts";
import { roomCodeSchema } from "#/lib/schemas.ts";
import { joinName } from "#/lib/storage.ts";

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
  if (!scribble) return <DemoRoom />;

  // Keyed by code so switching rooms starts the whole arrival over — the name
  // asked for again if it has to be, and a provider (with its socket) built
  // from scratch rather than one still pointed at the old room.
  return <JoinFlow key={scribble} code={scribble} />;
}

/**
 * Settles who is arriving before anything connects.
 *
 * The name goes out in the join message and the server fixes it there, so the
 * one place it can still be chosen is ahead of the socket. Players who came
 * through the home card answered on the way, and a tab that has already joined
 * this room answered before the reload; a link is the case with no answer yet,
 * and the only one that stops to ask.
 */
function JoinFlow({ code }: { code: string }) {
  // `undefined` while the answer is still being looked up — it lives in this
  // tab's storage, which the server render cannot see — and `null` once it is
  // settled that there isn't one.
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => setName(joinName(code)), [code]);

  if (name === undefined) {
    return <RoomNotice title={`Room ${code}`} description="One moment…" />;
  }

  if (name === null) return <JoinGate code={code} onJoin={setName} />;

  return (
    <RoomProvider code={code} name={name}>
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
  const { status, error, retry } = useRoom();
  const navigate = useNavigate();

  if (status === "joined") return <LiveRoom />;

  const closed = status === "closed";

  return (
    <RoomNotice
      title={closed ? "Room unavailable" : "Joining the room"}
      description={
        closed
          ? (error ?? "The connection dropped.")
          : status === "reconnecting"
            ? "Lost the connection — getting you back…"
            : "Connecting to the server…"
      }
    >
      {closed ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>
            Back home
          </Button>
          <Button onClick={retry}>Try again</Button>
        </div>
      ) : null}
    </RoomNotice>
  );
}

/** The page a room stands behind while it is not yet, or no longer, a room. */
function RoomNotice({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {children}
      </Empty>
    </main>
  );
}

/** The room as the server sees it. Every prop below comes off one store. */
function LiveRoom() {
  const navigate = useNavigate();
  const { code, owner } = useRoom();
  const players = usePlayers();
  const { entries, guess } = useChat();
  const turn = useTurn();
  const { settings, update: updateSettings } = useSettings();
  const canvas = useCanvas();

  // The store holds the deadline the server gave us; the clock runs here.
  const secondsLeft = useCountdown(turn.deadline);

  return (
    <RoomLayout
      code={code}
      players={players}
      chat={entries}
      round={turn.round}
      totalRounds={turn.totalRounds}
      secondsLeft={secondsLeft}
      turnSeconds={turn.seconds}
      phase={turn.phase}
      word={turn.slots.word}
      revealed={turn.slots.revealed}
      reveal={turn.slots.reveal}
      // Empty for everyone but the drawer, who is the only player the
      // server tells what is on offer.
      choices={turn.choices}
      onPick={turn.pick}
      // A drawer is what a running turn has and an idle room does not, which
      // is what puts the room on the board or back in the lobby.
      live={turn.drawerId !== null}
      hosting={owner}
      // Held by the room rather than by this tab, so every player sees the
      // same dials and a reconnect finds them already set. What a change
      // comes to is the server's call, and it only listens to the host.
      settings={settings}
      onSettingsChange={updateSettings}
      onStart={turn.start}
      onGuess={guess}
      onCommand={canvas.push}
      subscribe={canvas.listen}
      onLeave={() => navigate({ to: "/" })}
    />
  );
}

/** The same room with nothing behind it, for judging it without a server. */
function DemoRoom() {
  const navigate = useNavigate();

  // Placeholder clock. A real turn's deadline comes from the server; this only
  // keeps the ring moving so the layout can be seen in motion.
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((left) => (left > 0 ? left - 1 : TURN_SECONDS));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const drawing = MOCK_PLAYERS.some(
    (player) => player.self && player.status === "drawing",
  );

  return (
    <RoomLayout
      code={DEMO_CODE}
      players={MOCK_PLAYERS}
      chat={MOCK_CHAT}
      round={2}
      totalRounds={TOTAL_ROUNDS}
      secondsLeft={secondsLeft}
      turnSeconds={TURN_SECONDS}
      // Straight to the drawing: the placeholder has no server to pick a
      // word with, so the board is what it opens on once it is walked to.
      phase="drawing"
      word={MOCK_WORD}
      revealed={MOCK_REVEALED}
      reveal={drawing}
      choices={[]}
      // No server to start anything, so the placeholder opens on the lobby
      // and is walked through to the board by hand — which is the point of
      // it: every stage is reachable without a second player.
      live={false}
      hosting
      onLeave={() => navigate({ to: "/" })}
    />
  );
}
