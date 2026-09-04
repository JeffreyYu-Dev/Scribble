import { useEffect, useState } from "react";

import { Canvas } from "#/components/room/canvas.tsx";
import { Toolbar } from "#/components/room/toolbar.tsx";
import type { BrushSize, BrushTool } from "#/components/room/tools.ts";
import {
	DEFAULT_BRUSHES,
	DEFAULT_COLOR,
	DEFAULT_SECONDARY,
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
	// Two inks, on the two mouse buttons. See `DEFAULT_SECONDARY`.
	const [color, setColor] = useState<string>(DEFAULT_COLOR);
	const [secondary, setSecondary] = useState<string>(DEFAULT_SECONDARY);
	// One width per brush, so switching to the eraser and back leaves the pen
	// exactly as it was.
	const [brushes, setBrushes] =
		useState<Record<BrushTool, BrushSize>>(DEFAULT_BRUSHES);

	const { canvas, draw, apply, undo, redo, canUndo, canRedo } = useDrawing({
		tool,
		color,
		secondary,
		// A fill has no width of its own; it ignores the size it is handed.
		size: tool === "eraser" ? brushes.eraser : brushes.pen,
		disabled,
		onCommand,
	});

	// Registered after `useDrawing` has blanked the sheet, so a board that
	// mounts mid-turn is caught up onto white paper rather than a stale one.
	useEffect(() => subscribe?.(apply), [subscribe, apply]);

	// The shortcuts everyone reaches for. They listen on the window rather than
	// the canvas because the board is never focused — you draw on it, you do not
	// tab to it — so anywhere on the page counts, bar a field someone is typing
	// their guess into, which has an undo of its own.
	useEffect(() => {
		if (disabled) return;

		function onKeyDown(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey) || typing(event.target)) return;

			// Shift+Z is redo everywhere but Windows, where it is Ctrl+Y. Both are
			// cheap to honour, so both are.
			const key = event.key.toLowerCase();
			const redoing = key === "y" || (key === "z" && event.shiftKey);
			if (key !== "z" && key !== "y") return;

			event.preventDefault();
			if (redoing) redo();
			else undo();
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [disabled, undo, redo]);

	return (
		<div className={cn("flex w-full flex-col gap-2", className)}>
			<Sheet>
				<Canvas {...canvas} />
				{overlay}
			</Sheet>

			{/*
				The kit belongs to whoever holds the pen. A watcher has nothing to
				choose, so the bar goes rather than greying out — the board keeps
				its size either way, since the sheet is sized by the room.
			*/}
			{!disabled && (
				<Toolbar
					tool={tool}
					onToolChange={setTool}
					color={color}
					onColorChange={setColor}
					secondary={secondary}
					onSecondaryChange={setSecondary}
					onSwapInks={() => {
						setColor(secondary);
						setSecondary(color);
					}}
					brushes={brushes}
					onBrushChange={(brushTool, size) =>
						setBrushes((current) => ({ ...current, [brushTool]: size }))
					}
					onUndo={undo}
					onRedo={redo}
					canUndo={canUndo}
					canRedo={canRedo}
					onClear={() => draw({ kind: "clear" })}
				/>
			)}
		</div>
	);
}

/**
 * Whether a keystroke belongs to something else. A guess being typed carries
 * its own undo, and the board must not steal it.
 */
function typing(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement)
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
