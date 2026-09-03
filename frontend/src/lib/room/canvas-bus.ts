/**
 * The board's channel, and the one part of the room that is not a store.
 *
 * Strokes arrive tens of times a second and every one of them is a draw call,
 * not a change of state: nothing reads them back, nothing renders from them,
 * and putting them through React would mean diffing an array that only ever
 * grows. So they go straight from the socket to a canvas context.
 *
 * The same asymmetry applies outbound. A drag emits a command per pointer move;
 * sending each one as its own frame is a message every few milliseconds for a
 * line that is only redrawn once a frame anyway. Commands are accumulated
 * instead and flushed on `requestAnimationFrame`, with the segments of one drag
 * folded into a single stroke on the way — roughly an order of magnitude fewer
 * messages, and each one is a shape the receiver already knows how to draw.
 */

import type { DrawCommand, Point } from "#/lib/drawing/types.ts";
import type { Dispatcher } from "#/lib/net/dispatch.ts";
import type { ClientMessage, ServerMessage } from "#/lib/room/protocol.ts";

/**
 * A hidden tab gets no frames, so the buffer is also flushed once it grows past
 * this many points. It bounds the memory and keeps a backgrounded drawer's line
 * from arriving all at once when they come back.
 */
const FLUSH_AT = 512;

/**
 * How much of the board is kept for a canvas that mounts late. A `clear` empties
 * it, so in practice it is one turn's worth of drawing; the cap is only there so
 * a very long turn cannot grow without end.
 */
const HISTORY_LIMIT = 4096;

export type CanvasBus = {
	/**
	 * Register a renderer. It is caught up on the board so far — the room
	 * snapshot usually lands before the canvas mounts — and then fed every
	 * command as it arrives. Returns an unsubscribe.
	 */
	listen: (apply: (command: DrawCommand) => void) => () => void;
	/** A command drawn here. Buffered, and sent on the next frame. */
	push: (command: DrawCommand) => void;
	/** Forget the board and drop anything unsent. */
	reset: () => void;
};

export function createCanvasBus(
	dispatcher: Dispatcher<ServerMessage>,
	send: (message: ClientMessage) => void,
): CanvasBus {
	const listeners = new Set<(command: DrawCommand) => void>();

	/** Everything on the paper since the last clear. */
	let history: DrawCommand[] = [];
	/** Local commands waiting for the next frame, and the points they hold. */
	let outbox: DrawCommand[] = [];
	let buffered = 0;
	let frame = 0;

	dispatcher.on("draw", (message) => {
		for (const command of message.commands) emit(command);
	});

	// A full board replaces whatever we had, so it starts from blank paper.
	dispatcher.on("canvas", (message) => {
		emit({ kind: "clear" });
		for (const command of message.commands) emit(command);
	});

	/** Remember a command, so a canvas mounting later can be caught up on it. */
	function record(command: DrawCommand) {
		if (command.kind === "clear") {
			history = [];
			return;
		}
		history.push(command);
		// Trimmed in bulk rather than one at a time, so the copy is rare.
		if (history.length > HISTORY_LIMIT) {
			history = history.slice(history.length - HISTORY_LIMIT / 2);
		}
	}

	/** A command from someone else: remember it, then draw it. */
	function emit(command: DrawCommand) {
		record(command);
		for (const listener of [...listeners]) listener(command);
	}

	/**
	 * Fold a command into the outbox. Consecutive pieces of one drag share their
	 * settings and meet end to end, so they become one stroke with one list of
	 * points instead of a message each.
	 */
	function buffer(command: DrawCommand) {
		const last = outbox.at(-1);

		if (
			command.kind === "stroke" &&
			last?.kind === "stroke" &&
			last.id === command.id &&
			last.color === command.color &&
			last.size === command.size
		) {
			const [head, ...rest] = command.points;
			// The first point of a segment is the last point of the one before
			// it; keeping both would only thicken the seam.
			if (head && !same(head, last.points.at(-1))) last.points.push(head);
			last.points.push(...rest);
			buffered += command.points.length;
			return;
		}

		// Copied, because the merge above appends to `points` in place and the
		// caller still owns the array it handed us.
		outbox.push(
			command.kind === "stroke"
				? { ...command, points: [...command.points] }
				: command,
		);
		buffered += command.kind === "stroke" ? command.points.length : 1;
	}

	function flush() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		if (outbox.length === 0) return;
		send({ type: "draw", commands: outbox });
		outbox = [];
		buffered = 0;
	}

	return {
		listen(apply) {
			for (const command of history) apply(command);
			listeners.add(apply);
			return () => {
				listeners.delete(apply);
			};
		},

		push(command) {
			// Only recorded, not emitted: the canvas that made this command has
			// already drawn it, and the server does not echo it back either.
			record(command);
			buffer(command);

			if (buffered >= FLUSH_AT) {
				flush();
				return;
			}
			if (!frame) frame = requestAnimationFrame(flush);
		},

		reset() {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			outbox = [];
			buffered = 0;
			history = [];
		},
	};
}

function same(a: Point, b: Point | undefined) {
	return b !== undefined && a.x === b.x && a.y === b.y;
}
