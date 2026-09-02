/**
 * The one place pixels are written. `render` is deliberately the whole surface
 * of this module: local strokes and strokes arriving over the socket are the
 * same commands, so they go through the same door and land identically.
 */

import type { DrawCommand, Point } from "#/lib/drawing/types.ts";

/** The bitmap's fixed size. CSS stretches the element to fit the board. */
export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1200;

/** The paper. The eraser is just a brush loaded with it. */
export const PAPER = "#ffffff";

/**
 * How far a pixel may drift from the one that was clicked and still count as
 * the same area. Strokes are drawn with antialiasing, so their edges fade into
 * the paper; without some give, a fill would stop short and leave a halo.
 */
const FILL_TOLERANCE = 32;

export function render(
	context: CanvasRenderingContext2D,
	command: DrawCommand,
) {
	switch (command.kind) {
		case "stroke":
			return stroke(context, command);
		case "fill":
			return fill(context, command);
		case "clear":
			return clear(context);
	}
}

function clear(context: CanvasRenderingContext2D) {
	const { width, height } = context.canvas;
	context.fillStyle = PAPER;
	context.fillRect(0, 0, width, height);
}

function stroke(
	context: CanvasRenderingContext2D,
	{ color, size, points }: Extract<DrawCommand, { kind: "stroke" }>,
) {
	const [first, ...rest] = points;
	if (!first) return;

	context.fillStyle = color;
	context.strokeStyle = color;
	context.lineWidth = size;
	// Round ends and joins are what let a drag be streamed segment by segment:
	// each piece caps itself, so the seams between them do not show.
	context.lineCap = "round";
	context.lineJoin = "round";

	if (rest.length === 0) {
		context.beginPath();
		context.arc(first.x, first.y, size / 2, 0, Math.PI * 2);
		context.fill();
		return;
	}

	context.beginPath();
	context.moveTo(first.x, first.y);
	for (const point of rest) context.lineTo(point.x, point.y);
	context.stroke();
}

/**
 * Scanline flood fill: rows are filled a span at a time and only the start of
 * each newly touched span above or below is queued, which keeps the queue
 * proportional to the shape's edges instead of its area.
 */
function fill(
	context: CanvasRenderingContext2D,
	{ color, at }: Extract<DrawCommand, { kind: "fill" }>,
) {
	const { width, height } = context.canvas;
	const start = { x: Math.floor(at.x), y: Math.floor(at.y) };
	if (!inside(start, width, height)) return;

	const image = context.getImageData(0, 0, width, height);
	const pixels = image.data;
	const target = pixelAt(pixels, offset(start.x, start.y, width));
	const ink = rgb(color);
	// A pixel is marked as visited by being painted, so filling with a shade
	// the fill would still accept would never terminate.
	if (near(target, ink)) return;

	const queue: Point[] = [start];
	while (queue.length > 0) {
		const seed = queue.pop();
		if (!seed) break;

		let left = seed.x;
		while (left > 0 && matches(pixels, offset(left - 1, seed.y, width), target))
			left--;
		let right = seed.x;
		while (
			right < width - 1 &&
			matches(pixels, offset(right + 1, seed.y, width), target)
		)
			right++;

		let above = false;
		let below = false;
		for (let x = left; x <= right; x++) {
			paint(pixels, offset(x, seed.y, width), ink);

			const up =
				seed.y > 0 && matches(pixels, offset(x, seed.y - 1, width), target);
			if (up && !above) queue.push({ x, y: seed.y - 1 });
			above = up;

			const down =
				seed.y < height - 1 &&
				matches(pixels, offset(x, seed.y + 1, width), target);
			if (down && !below) queue.push({ x, y: seed.y + 1 });
			below = down;
		}
	}

	context.putImageData(image, 0, 0);
}

type Rgb = [number, number, number, number];

function offset(x: number, y: number, width: number) {
	return (y * width + x) * 4;
}

function inside({ x, y }: Point, width: number, height: number) {
	return x >= 0 && y >= 0 && x < width && y < height;
}

function pixelAt(pixels: Uint8ClampedArray, index: number): Rgb {
	return [
		pixels[index],
		pixels[index + 1],
		pixels[index + 2],
		pixels[index + 3],
	];
}

function paint(pixels: Uint8ClampedArray, index: number, [r, g, b, a]: Rgb) {
	pixels[index] = r;
	pixels[index + 1] = g;
	pixels[index + 2] = b;
	pixels[index + 3] = a;
}

function matches(pixels: Uint8ClampedArray, index: number, target: Rgb) {
	return near(pixelAt(pixels, index), target);
}

function near(a: Rgb, b: Rgb) {
	return (
		Math.abs(a[0] - b[0]) <= FILL_TOLERANCE &&
		Math.abs(a[1] - b[1]) <= FILL_TOLERANCE &&
		Math.abs(a[2] - b[2]) <= FILL_TOLERANCE &&
		Math.abs(a[3] - b[3]) <= FILL_TOLERANCE
	);
}

/** Palette colours are all `#rrggbb`; anything else falls back to black. */
function rgb(color: string): Rgb {
	const hex = /^#([\da-f]{6})$/i.exec(color)?.[1];
	const value = hex ? Number.parseInt(hex, 16) : 0;
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}
