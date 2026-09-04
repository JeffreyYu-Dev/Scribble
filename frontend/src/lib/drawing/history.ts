/**
 * The board's memory: two stacks, and the rule that turns a stream of commands
 * into what the paper should show.
 *
 * Undo cannot be a mark of its own — there is no ink that un-draws a stroke —
 * so the board is instead rebuilt from the commands that made it: blank paper,
 * then everything still standing. That is the whole trick, and it is why undo
 * needs no knowledge of any particular tool. A pen stroke, an eraser stroke and
 * a fill are all just commands on the stack, and taking any of them back is the
 * same operation.
 *
 * Every client runs one of these, over the same command stream, so the drawer
 * undoing and a watcher seeing it undone are the same code reaching the same
 * paper. `undo` and `redo` go over the wire as commands like any other.
 */

import type { DrawCommand, PaintCommand } from "#/lib/drawing/types.ts";

/**
 * One undoable step. A drag arrives as many short commands sharing an id and
 * folds into a single step, so one undo takes back one stroke rather than one
 * twitch of the pointer.
 */
type Step = PaintCommand[];

/**
 * How many steps stay undoable. Older ones are not thrown away — that would
 * make an undo erase art nobody asked it to — but folded into the base below,
 * where they still get replayed and can simply no longer be popped.
 */
const STEP_LIMIT = 512;

export type History = {
	/**
	 * Fold one command in, and return what the canvas has to paint for it: the
	 * command itself for a mark, and for an undo the whole board again.
	 */
	accept: (command: DrawCommand) => PaintCommand[];
	canUndo: () => boolean;
	canRedo: () => boolean;
};

export function createHistory(): History {
	/** Marks too old to take back. Replayed, never popped. */
	let base: PaintCommand[] = [];
	/** The steps still standing, oldest first; the last mark is on top. */
	let done: Step[] = [];
	/** Steps taken back, the most recent undo on top. */
	let undone: Step[] = [];

	/** Blank paper, then every mark that survives. */
	function repaint(): PaintCommand[] {
		return [{ kind: "clear" }, ...base, ...done.flat()];
	}

	function record(command: PaintCommand) {
		const top = done.at(-1);
		// The pieces of one drag share an id: they are one mark, and one undo.
		const last = top?.at(-1);
		if (
			top &&
			command.kind === "stroke" &&
			last?.kind === "stroke" &&
			last.id === command.id
		) {
			top.push(command);
			return;
		}

		done.push([command]);
		// One step over at a time, so this shifts at most once and the cost of
		// moving 512 references is paid once per stroke rather than per segment.
		if (done.length > STEP_LIMIT) {
			const oldest = done.shift();
			if (oldest) base.push(...oldest);
		}
	}

	return {
		accept(command) {
			switch (command.kind) {
				case "undo": {
					const step = done.pop();
					if (!step) return [];
					undone.push(step);
					return repaint();
				}

				case "redo": {
					const step = undone.pop();
					if (!step) return [];
					done.push(step);
					// A step only ever adds to what is already on the paper, so a
					// redo is painted on top instead of replayed from blank.
					return step;
				}

				case "clear":
					// Not an undoable step. The command log is compacted at a clear
					// by the bus that holds it for late arrivals and by the server
					// that holds it for the room, so there would be nothing left to
					// replay for anyone who joined after; both stacks go with it
					// rather than promise the drawer something the room cannot see.
					base = [];
					done = [];
					undone = [];
					return [command];

				default:
					record(command);
					// A fresh mark forks the history: what was undone is now gone.
					undone = [];
					return [command];
			}
		},

		canUndo: () => done.length > 0,
		canRedo: () => undone.length > 0,
	};
}
