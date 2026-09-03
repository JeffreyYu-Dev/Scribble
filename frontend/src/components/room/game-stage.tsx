/**
 * The game itself: the board, its toolbar, and the guesses coming in beside it.
 *
 * The roster is not here — it belongs to the shell, and stays on screen through
 * the lobby, the settings and the game alike.
 */

import { ChatPanel } from "#/components/room/chat-panel.tsx";
import { DrawingBoard } from "#/components/room/drawing-board.tsx";
import type { DrawCommand } from "#/lib/drawing/types.ts";
import type { InkMap } from "#/lib/room/ink.ts";
import type { ChatEntry } from "#/lib/room/types.ts";

type GameStageProps = {
	chat: ChatEntry[];
	/** The room's colours, keyed by name. Shared with the roster in the shell. */
	inks: InkMap;
	/** Whether the local player holds the pen this turn. */
	drawing: boolean;
	/** The drawer cannot guess, and neither can anyone who already has it. */
	canGuess: boolean;
	onGuess?: (text: string) => void;
	onCommand?: (command: DrawCommand) => void;
	subscribe?: (apply: (command: DrawCommand) => void) => () => void;
	/** Laid over the board while there is nothing on it. See `TurnOverlay`. */
	overlay?: React.ReactNode;
};

export function GameStage({
	chat,
	inks,
	drawing,
	canGuess,
	onGuess,
	onCommand,
	subscribe,
	overlay,
}: GameStageProps) {
	return (
		// A row, not a grid: the board is sized by the height available to it, so
		// whatever width is left over is handed to the chat (`grow`) instead of
		// becoming dead margin beside the board. The board is also the only track
		// that shrinks once the row runs out of room.
		<div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:items-stretch">
			<DrawingBoard
				disabled={!drawing}
				onCommand={onCommand}
				subscribe={subscribe}
				overlay={overlay}
				className="lg:w-(--board-w)"
			/>

			<ChatPanel
				entries={chat}
				inks={inks}
				onGuess={onGuess}
				canGuess={canGuess}
				className="h-80 lg:h-auto lg:shrink-0 lg:grow lg:basis-68"
			/>
		</div>
	);
}
