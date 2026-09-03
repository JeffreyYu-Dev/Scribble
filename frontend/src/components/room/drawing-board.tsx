import { useEffect, useState } from "react";

import { Canvas } from "#/components/room/canvas.tsx";
import { Toolbar } from "#/components/room/toolbar.tsx";
import type { BrushSize, BrushTool } from "#/components/room/tools.ts";
import {
	DEFAULT_BRUSHES,
	DEFAULT_COLOR,
	DEFAULT_TOOL,
} from "#/components/room/tools.ts";
import { useDrawing } from "#/hooks/use-drawing.ts";
import type { DrawCommand, Tool } from "#/lib/drawing/types.ts";
import { cn } from "#/lib/utils.ts";

type DrawingBoardProps = {
	/** Everything greys out while someone else holds the pen. */
	disabled?: boolean;
	/**
	 * Where the socket plugs in: every command drawn here, in the order it was
	 * drawn.
	 */
	onCommand?: (command: DrawCommand) => void;
	/**
	 * The other direction. The board hands over its renderer and everyone
	 * else's strokes are played back through it, bypassing React entirely —
	 * returns an unsubscribe, like any other subscription.
	 */
	subscribe?: (apply: (command: DrawCommand) => void) => () => void;
	/**
	 * Laid over the paper, covering it exactly. For the moments the board is
	 * blank and something else has the floor — a round opening, a word being
	 * picked. Positioned by whatever is passed in.
	 */
	overlay?: React.ReactNode;
	className?: string;
};

/**
 * The board and its settings, kept together because they are one thing: the
 * toolbar chooses the ink, the canvas spends it. The turn's tool state lives
 * here rather than in the route, so the room only has to say who may draw.
 */
export function DrawingBoard({
	disabled = false,
	onCommand,
	subscribe,
	overlay,
	className,
}: DrawingBoardProps) {
	const [tool, setTool] = useState<Tool>(DEFAULT_TOOL);
	const [color, setColor] = useState<string>(DEFAULT_COLOR);
	// One width per brush, so switching to the eraser and back leaves the pen
	// exactly as it was.
	const [brushes, setBrushes] =
		useState<Record<BrushTool, BrushSize>>(DEFAULT_BRUSHES);

	const { canvas, draw, apply } = useDrawing({
		tool,
		color,
		// A fill has no width of its own; it ignores the size it is handed.
		size: tool === "eraser" ? brushes.eraser : brushes.pen,
		disabled,
		onCommand,
	});

	// Registered after `useDrawing` has blanked the sheet, so a board that
	// mounts mid-turn is caught up onto white paper rather than a stale one.
	useEffect(() => subscribe?.(apply), [subscribe, apply]);

	return (
		<div className={cn("flex w-full flex-col gap-2", className)}>
			<Sheet>
				<Canvas {...canvas} disabled={disabled} />
				{overlay}
			</Sheet>

			<Toolbar
				tool={tool}
				onToolChange={setTool}
				color={color}
				onColorChange={setColor}
				brushes={brushes}
				onBrushChange={(brushTool, size) =>
					setBrushes((current) => ({ ...current, [brushTool]: size }))
				}
				// TODO: undo. It wants a history of commands grouped by stroke id,
				// which is what `DrawCommand.id` is there for.
				onClear={() => draw({ kind: "clear" })}
				disabled={disabled}
			/>
		</div>
	);
}

/**
 * The page the round is drawn on: a 4:3 sheet that keeps its ratio while
 * filling whatever room the layout gives it. The paper stays white in both
 * themes — strokes are drawn in ink colours that only read on white — so this
 * is the one surface that does not follow the theme tokens.
 */
function Sheet({ children }: { children: React.ReactNode }) {
	return (
		// The drop shadow is what separates white paper from the tinted page
		// behind it, now that the page is no longer white itself.
		<div className="relative isolate mx-auto aspect-[4/3] w-full overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)] ring-1 ring-foreground/10">
			{children}
		</div>
	);
}
