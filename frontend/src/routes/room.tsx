import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ChatPanel } from "#/components/room/chat-panel.tsx";
import { DrawingBoard } from "#/components/room/drawing-board.tsx";
import { PlayerList } from "#/components/room/player-list.tsx";
import { RoomHeader } from "#/components/room/room-header.tsx";
import { Toolbar } from "#/components/room/toolbar.tsx";
import type { BrushSize, Tool } from "#/lib/room.ts";
import {
	MOCK_CHAT,
	MOCK_PLAYERS,
	MOCK_REVEALED,
	MOCK_WORD,
	TOTAL_ROUNDS,
	TURN_SECONDS,
} from "#/lib/room.ts";

// TODO: read the room from `?scribble=` and hydrate the panels from the socket.
export const Route = createFileRoute("/room")({ component: Room });

/**
 * Everything stacked above and below the board: page padding, the header, the
 * toolbar and the two gaps between them. The board's width cap is derived from
 * the height left over once this is taken out, which is why the toolbar scrolls
 * sideways rather than wrapping — a second toolbar row would invalidate it.
 */
const ROOM_CHROME = "9.5rem";

function Room() {
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
				code="abc"
				round={2}
				totalRounds={TOTAL_ROUNDS}
				secondsLeft={secondsLeft}
				turnSeconds={TURN_SECONDS}
				word={MOCK_WORD}
				revealed={MOCK_REVEALED}
				drawing={drawing}
				drawerName={drawer?.name ?? "nobody"}
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
					<DrawingBoard />
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
