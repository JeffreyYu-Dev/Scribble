import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "#/components/room/canvas.tsx";
import { ChatPanel } from "#/components/room/chat-panel.tsx";
import { DrawingBoard } from "#/components/room/drawing-board.tsx";
import { PlayerList } from "#/components/room/player-list.tsx";
import { RoomHeader } from "#/components/room/room-header.tsx";
import { RoomProvider, useRoom } from "#/components/room/room-provider.tsx";
import { Toolbar } from "#/components/room/toolbar.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import type { BrushSize, Tool } from "#/lib/room.ts";
import {
	MOCK_CHAT,
	MOCK_PLAYERS,
	MOCK_REVEALED,
	MOCK_WORD,
	TOTAL_ROUNDS,
	TURN_SECONDS,
} from "#/lib/room.ts";
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
 * toolbar and the two gaps between them. The board's width cap is derived from
 * the height left over once this is taken out, which is why the toolbar scrolls
 * sideways rather than wrapping — a second toolbar row would invalidate it.
 */
const ROOM_CHROME = "9.5rem";

function Room({ code }: { code: string }) {
	const navigate = useNavigate();
	const [tool, setTool] = useState<Tool>("pen");
	const [color, setColor] = useState("#000000");
	const [brush, setBrush] = useState<BrushSize>(10);

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
	const drawer = players.find((player) => player.status === "drawing");
	const you = players.find((player) => player.self);
	const drawing = drawer?.self ?? false;

	return (
		<div
			style={{ "--room-chrome": ROOM_CHROME } as React.CSSProperties}
			className="type-compact flex min-h-svh flex-col gap-2 p-2 lg:h-svh"
		>
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
				A row, not a grid: the board is sized by the height available to
				it, so whatever width is left over is handed to the side panels
				(`grow`) instead of becoming dead margin either side of the board.
			*/}
			<main className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
				<PlayerList
					players={players}
					className="max-h-64 lg:max-h-none lg:shrink-0 lg:grow lg:basis-56"
				/>

				{/*
					Board and toolbar share one column, so they always line up. It
					is the widest 4:3 board whose height still clears the fixed
					furniture above and below it (--room-chrome), and it is the only
					track that shrinks once the row runs out of room.
				*/}
				<div className="flex w-full flex-col gap-2 lg:w-[calc((100svh-var(--room-chrome))*4/3)]">
					<DrawingBoard>
						<Canvas />
					</DrawingBoard>
					<Toolbar
						tool={tool}
						onToolChange={setTool}
						color={color}
						onColorChange={setColor}
						brush={brush}
						onBrushChange={setBrush}
						disabled={!drawing}
					/>
				</div>

				<ChatPanel
					entries={MOCK_CHAT}
					canGuess={!drawing && you?.status !== "guessed"}
					className="h-80 lg:h-auto lg:shrink-0 lg:grow lg:basis-68"
				/>
			</main>
		</div>
	);
}
