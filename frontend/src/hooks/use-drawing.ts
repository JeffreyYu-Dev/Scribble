/**
 * Turns pointer events into draw commands.
 *
 * The hook is the whole of the drawing behaviour: the toolbar picks the
 * settings, this reads the pointer and decides what the settings mean, and
 * `render` puts it on the paper. Nothing here knows about the socket — it
 * hands every command it makes to `onCommand`, which is where the wire goes.
 *
 * Commands of our own and commands off the socket both go through one history,
 * because they are one board: the stacks have to hold what is actually on the
 * paper, whoever put it there.
 */

import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { brushCursor, FILL_CURSOR } from "#/lib/drawing/cursor.ts";
import type { History } from "#/lib/drawing/history.ts";
import { createHistory } from "#/lib/drawing/history.ts";
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
	/** The second ink, laid down by the right button. */
	secondary: string;
	size: number;
	/** The board is read-only while someone else holds the pen. */
	disabled?: boolean;
	/** Every command this client makes, ready to be sent to the server. */
	onCommand?: (command: DrawCommand) => void;
};

export function useDrawing({
	tool,
	color,
	secondary,
	size,
	disabled = false,
	onCommand,
}: UseDrawingOptions) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	/**
	 * The drag in progress: its id, where the last segment ended, and which ink
	 * it started in. The ink is carried rather than read again per segment so a
	 * stroke keeps the colour of the button that began it, whatever happens to
	 * the buttons or the tray while it is being drawn.
	 */
	const dragRef = useRef<{ id: string; from: Point; ink: string } | null>(null);

	// The stacks behind the board. They live in a ref because they are not what
	// is rendered — the canvas is — and a stroke would otherwise re-render the
	// tree on every pointer move. Only the two flags below are state, and they
	// are booleans, so setting them to what they already are costs nothing.
	const historyRef = useRef<History | null>(null);
	historyRef.current ??= createHistory();
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	// `onCommand` is read from a ref so a caller passing a fresh function every
	// render does not rebuild the pointer handlers mid-stroke.
	const emitRef = useRef(onCommand);
	emitRef.current = onCommand;

	/**
	 * Put a command on the paper: through the history, which answers with the
	 * marks to paint — the command itself for a stroke or a fill, and the whole
	 * board again for an undo.
	 */
	const apply = useCallback((command: DrawCommand) => {
		const context = canvasRef.current?.getContext("2d");
		// Nothing is recorded while there is nowhere to draw it, or the stacks
		// would come to hold marks the paper never got.
		if (!context) return;

		const history = historyRef.current;
		if (!history) return;

		for (const mark of history.accept(command)) render(context, mark);
		setCanUndo(history.canUndo());
		setCanRedo(history.canRedo());
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

	// How far the sheet is stretched. The bitmap is a fixed 1600 across and CSS
	// sizes the element, so a brush's width in board pixels is not its width on
	// screen — and the cursor has to be the width on screen to sit exactly over
	// the pixels the stroke would cover.
	const [scale, setScale] = useState(1);
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const observer = new ResizeObserver(([entry]) => {
			if (entry) setScale(entry.contentRect.width / BOARD_WIDTH);
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// Watchers get the plain arrow they would have anywhere else: the board is
	// simply not theirs to draw on, which is different from being broken.
	const cursor = useMemo(
		() =>
			disabled
				? "default"
				: tool === "fill"
					? FILL_CURSOR
					: brushCursor(size * scale),
		[disabled, scale, size, tool],
	);

	// An eraser is a brush loaded with paper, and is that whichever button is
	// pressed: there is no second shade of blank.
	const inkFor = useCallback(
		(alternate: boolean) =>
			tool === "eraser" ? PAPER : alternate ? secondary : color,
		[color, secondary, tool],
	);

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			// Left and right only. Pens and fingers report button 0, so they draw
			// in the first ink like a mouse does; a middle click is nobody's.
			if (disabled || !canvas) return;
			if (event.button !== 0 && event.button !== 2) return;

			// Ctrl+click counts too: a Mac trackpad without two-finger tap turned
			// on has no right button to press, and it is bound to nothing else
			// over the paper.
			const ink = inkFor(event.button === 2 || event.ctrlKey);
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
			dragRef.current = { id, from: at, ink };
			// A single point: a click that never moves still leaves a dot.
			draw({ kind: "stroke", id, color: ink, size, points: [at] });
		},
		[disabled, draw, inkFor, size, tool],
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
				color: drag.ink,
				size,
				points: [drag.from, at],
			});
			drag.from = at;
		},
		[draw, size],
	);

	const onPointerUp = useCallback(() => {
		dragRef.current = null;
	}, []);

	// Drawn rather than applied: taking a mark back is a change to the board
	// like any other, and the room has to see it happen. The guards keep a
	// keyboard shortcut on an empty stack off the wire.
	const undo = useCallback(() => {
		if (historyRef.current?.canUndo()) draw({ kind: "undo" });
	}, [draw]);

	const redo = useCallback(() => {
		if (historyRef.current?.canRedo()) draw({ kind: "redo" });
	}, [draw]);

	return {
		/** Spread onto the `<canvas>`: `<Canvas {...canvas} />`. */
		canvas: {
			ref: canvasRef,
			width: BOARD_WIDTH,
			height: BOARD_HEIGHT,
			style: { cursor },
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel: onPointerUp,
			// The right button is a second ink here, so it must not also be the
			// browser's menu.
			onContextMenu: preventMenu,
		},
		draw,
		apply,
		undo,
		redo,
		/** Whether either stack has anything in it, for the toolbar's buttons. */
		canUndo,
		canRedo,
	};
}

function preventMenu(event: React.MouseEvent) {
	event.preventDefault();
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
