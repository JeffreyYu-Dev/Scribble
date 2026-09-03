/**
 * Turns pointer events into draw commands.
 *
 * The hook is the whole of the drawing behaviour: the toolbar picks the
 * settings, this reads the pointer and decides what the settings mean, and
 * `render` puts it on the paper. Nothing here knows about the socket — it
 * hands every command it makes to `onCommand`, which is where the wire goes.
 */

import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef } from "react";

import {
	BOARD_HEIGHT,
	BOARD_WIDTH,
	PAPER,
	render,
} from "#/lib/drawing/render.ts";
import type { DrawCommand, Point, Tool } from "#/lib/drawing/types.ts";

type UseDrawingOptions = {
	tool: Tool;
	color: string;
	size: number;
	/** The board is read-only while someone else holds the pen. */
	disabled?: boolean;
	/** Every command this client makes, ready to be sent to the server. */
	onCommand?: (command: DrawCommand) => void;
};

export function useDrawing({
	tool,
	color,
	size,
	disabled = false,
	onCommand,
}: UseDrawingOptions) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	/** The drag in progress: its id, and where the last segment ended. */
	const dragRef = useRef<{ id: string; from: Point } | null>(null);

	// `onCommand` is read from a ref so a caller passing a fresh function every
	// render does not rebuild the pointer handlers mid-stroke.
	const emitRef = useRef(onCommand);
	emitRef.current = onCommand;

	/** Draw a command that arrived from somewhere else. */
	const apply = useCallback((command: DrawCommand) => {
		const context = canvasRef.current?.getContext("2d");
		if (context) render(context, command);
	}, []);

	/** Draw a command of our own, and pass it on to be broadcast. */
	const draw = useCallback(
		(command: DrawCommand) => {
			apply(command);
			emitRef.current?.(command);
		},
		[apply],
	);

	// A fresh canvas is transparent, but the eraser paints paper: start the
	// bitmap as an actual white sheet so the two agree.
	useEffect(() => {
		apply({ kind: "clear" });
	}, [apply]);

	const ink = tool === "eraser" ? PAPER : color;

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			// Left button only; pens and fingers report button 0 as well.
			if (disabled || !canvas || event.button !== 0) return;

			const at = pointOf(canvas, event);
			// Capture keeps the drag alive when the pointer leaves the board, so
			// a stroke off the edge finishes instead of stranding `dragRef`.
			canvas.setPointerCapture(event.pointerId);

			if (tool === "fill") {
				draw({ kind: "fill", color: ink, at });
				return;
			}

			// nanoid rather than crypto.randomUUID: the latter exists only in a
			// secure context, and a phone opening the board over the LAN on plain
			// http is not one — there it is simply undefined. The id never leaves
			// the room and only has to tell one stroke from another, so an opaque
			// string is all it ever needed to be.
			const id = nanoid();
			dragRef.current = { id, from: at };
			// A single point: a click that never moves still leaves a dot.
			draw({ kind: "stroke", id, color: ink, size, points: [at] });
		},
		[disabled, draw, ink, size, tool],
	);

	const onPointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			const drag = dragRef.current;
			if (!canvas || !drag) return;

			const at = pointOf(canvas, event);
			draw({
				kind: "stroke",
				id: drag.id,
				color: ink,
				size,
				points: [drag.from, at],
			});
			drag.from = at;
		},
		[draw, ink, size],
	);

	const onPointerUp = useCallback(() => {
		dragRef.current = null;
	}, []);

	return {
		/** Spread onto the `<canvas>`: `<Canvas {...canvas} />`. */
		canvas: {
			ref: canvasRef,
			width: BOARD_WIDTH,
			height: BOARD_HEIGHT,
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel: onPointerUp,
		},
		draw,
		apply,
	};
}

/**
 * Where the pointer is on the bitmap. The canvas is stretched by CSS, so screen
 * pixels have to be scaled back to board pixels — which is also what makes a
 * stroke land in the same place on every player's screen.
 */
function pointOf(
	canvas: HTMLCanvasElement,
	event: React.PointerEvent<HTMLCanvasElement>,
): Point {
	const rect = canvas.getBoundingClientRect();
	return {
		x: ((event.clientX - rect.left) / rect.width) * canvas.width,
		y: ((event.clientY - rect.top) / rect.height) * canvas.height,
	};
}
