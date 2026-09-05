/**
 * The room's furniture, and the only thing on `/room` that never goes away.
 *
 * A room is one page for its whole life: the invite bar and the roster stay put
 * while the middle of the screen changes from the lobby, to the settings, to
 * whichever game the room picked. That is the whole reason this is split from
 * the stages it holds — the shell is what makes the change read as a room doing
 * something rather than as a page navigating.
 *
 * Purely presentational. It is handed a roster and a slot to fill, and has no
 * idea whether either came off a socket or out of the mock file.
 */

import { PlayerList } from "#/components/room/player-list.tsx";
import { RoomTopBar } from "#/components/room/room-top-bar.tsx";
import type { InkMap } from "#/lib/room/ink.ts";
import type { Player } from "#/lib/room/types.ts";

type RoomShellProps = {
	code: string;
	/** In join order: the colours are handed out by position. */
	players: Player[];
	/** Built from the roster above, and shared with whatever fills the stage. */
	inks: InkMap;
	/** Which list the rail shows: the lobby's roster, or the game's scoreboard. */
	roster?: "lobby" | "game";
	/** Top bar, left: the turn clock during a game, nothing in the lobby. */
	status?: React.ReactNode;
	/** Top bar, centre: the word, once there is one. */
	banner?: React.ReactNode;
	/** Above the roster. The lobby's summary card; nothing once a game is on. */
	aside?: React.ReactNode;
	onLeave?: () => void;
	/** The stage. Everything that changes when the room does. */
	children: React.ReactNode;
};

/**
 * Everything stacked above and below the stage: page padding, the top bar, a
 * game's toolbar and the two gaps between them. The board's width is derived
 * from the height left over once this is taken out, which is why the toolbar
 * scrolls sideways rather than wrapping — a second toolbar row would invalidate
 * it. It is rounded up a little: coming in under the viewport leaves a sliver
 * of unused floor, where coming in over it would crop the toolbar.
 */
const ROOM_CHROME = "10rem";

/**
 * The room is laid out for a 16:9 screen and stops growing either side of one:
 * past this width the extra pixels only inflate the side panels, and past this
 * height they only inflate the stage. Beyond either the room holds its size and
 * sits in the middle of the page instead. The height clears a 1080p viewport,
 * which is why an ordinary 16:9 monitor never meets it.
 */
const ROOM_MAX_W = "120rem";
const ROOM_MAX_H = "68rem";

/**
 * The room's own height, which every stage fills. Fixing it here rather than
 * letting each stage size itself is what stops the shell jumping when the
 * middle changes: the lobby and the board are laid out into the same box.
 *
 * `1rem` is the page padding below, which the room sits inside.
 */
const ROOM_H = `min(calc(100svh - 1rem), ${ROOM_MAX_H})`;

/**
 * The widest 4:3 board whose height still clears the fixed furniture above and
 * below it. Taken from the room's height rather than the viewport's, so a tall
 * screen stops feeding the board once the room has stopped growing.
 */
const BOARD_W = "calc((var(--room-h) - var(--room-chrome)) * 4 / 3)";

/** The roster's column. Fixed, so the stage beside it is what absorbs a resize. */
const RAIL_W = "17rem";

export function RoomShell({
	code,
	players,
	inks,
	roster = "game",
	status,
	banner,
	aside,
	onLeave,
	children,
}: RoomShellProps) {
	return (
		<div
			style={
				{
					"--room-chrome": ROOM_CHROME,
					"--room-max-w": ROOM_MAX_W,
					"--room-h": ROOM_H,
					"--board-w": BOARD_W,
					"--rail-w": RAIL_W,
				} as React.CSSProperties
			}
			className="type-compact flex min-h-svh justify-center p-2 lg:h-svh lg:items-center"
		>
			<div className="flex w-full max-w-(--room-max-w) flex-col gap-2 lg:h-(--room-h)">
				<RoomTopBar
					code={code}
					status={status}
					banner={banner}
					onLeave={onLeave}
				/>

				<div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:items-stretch">
					{/*
						The rail holds its width and the stage gives up the
						difference, which is what keeps the roster legible on a
						laptop instead of squeezing it along with the rest.
					*/}
					<aside className="flex min-h-0 flex-col gap-2 lg:w-(--rail-w) lg:shrink-0">
						{aside}
						{/*
							Handed the roster in join order: the list ranks it for
							itself when it is showing scores, and the inks were
							built from this order, so nobody's colour moves when it
							does.
						*/}
						<PlayerList
							players={players}
							inks={inks}
							variant={roster}
							className="max-h-64 min-h-0 flex-1 lg:max-h-none"
						/>
					</aside>

					<main className="flex min-h-0 flex-1 flex-col gap-2">{children}</main>
				</div>
			</div>
		</div>
	);
}
