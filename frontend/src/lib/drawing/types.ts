/**
 * The vocabulary of the board. Every change to the paper is one command, so
 * the same value can be drawn locally, put on the wire, and replayed by
 * everyone else through the very same `render`.
 */

export type Tool = "pen" | "eraser" | "fill";

/** A spot on the bitmap, in board pixels rather than screen pixels. */
export type Point = { x: number; y: number };

/** A command that puts ink on the paper. These are what `render` can draw. */
export type PaintCommand =
	/**
	 * A piece of one drag. A drag is streamed as many short commands rather
	 * than one long one so watchers see the line as it is made; `id` is what
	 * ties those pieces back together, for undo. One point means a dot.
	 */
	| { kind: "stroke"; id: string; color: string; size: number; points: Point[] }
	/** Flood the area under `at` with `color`. */
	| { kind: "fill"; color: string; at: Point }
	/** Back to blank paper. */
	| { kind: "clear" };

/**
 * Everything that may cross the wire. Undo and redo are not marks but moves
 * over the marks already made, and so are settled by `createHistory` rather
 * than by `render` — every client keeps the same stacks and reaches the same
 * paper from the same stream.
 */
export type DrawCommand = PaintCommand | { kind: "undo" } | { kind: "redo" };
