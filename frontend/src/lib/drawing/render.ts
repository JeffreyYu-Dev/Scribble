/**
 * The one place pixels are written. `render` is deliberately the whole surface
 * of this module: local strokes and strokes arriving over the socket are the
 * same commands, so they go through the same door and land identically.
 *
 * It draws marks and nothing else. Undo and redo are moves over the marks
 * already made and are settled by `createHistory`, which hands back the marks
 * to paint — so they never reach this file.
 */

import type { PaintCommand, Point } from "#/lib/drawing/types.ts";

/** The bitmap's fixed size. CSS stretches the element to fit the board. */
export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1200;

/** The paper. The eraser is just a brush loaded with it. */
export const PAPER = "#ffffff";

/**
 * How far a pixel may drift from the one that was clicked and still count as
 * the same area — which is to say, how far the flood is allowed to travel.
 * Deliberately tight: this is the number that decides whether a stroke holds
 * the paint in, and a generous one lets a fill escape through a pale line.
 */
const FILL_TOLERANCE = 32;

/**
 * How far past the area's edge the fill reaches, in pixels.
 *
 * A stroke is drawn antialiased, so it does not end: it fades into the paper
 * over about a pixel, and every step of that fade is a colour the flood above
 * refuses. Stopping there leaves the fade behind as a pale rim around the
 * shape — a fill that visibly does not touch the line it was drawn against.
 *
 * So the area is grown into its own edge afterwards. Two pixels is enough for
 * the fade on a diagonal, and it costs nothing on a straight one: the reach is
 * limited by `coverage` rather than by this, and a pixel that has become the
 * stroke outright takes no paint however close to it the fill gets.
 */
const FILL_FEATHER = 2;

/**
 * How far a pixel may have drifted from the area's colour and still be treated
 * as partly the area — the width of the fade, in effect. Past this a pixel is
 * the stroke itself and is left alone.
 *
 * There is no rule that separates a half-drawn dark line from a fully drawn
 * pale one; they are the same pixel. This is set high enough to recover the
 * fade under a dark stroke, which is what the paper is mostly drawn with, and
 * accepts that a fill run up against a very pale line will bleed a pixel or
 * two into it.
 */
const FILL_SPREAD = 190;

export function render(
	context: CanvasRenderingContext2D,
	command: PaintCommand,
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
	{ color, size, points }: Extract<PaintCommand, { kind: "stroke" }>,
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
 *
 * The flood finds the area; it does not paint it. Painting is one rule applied
 * afterwards to the area and to the fade around it alike — see `tint` — which
 * is what lets the fill reach under a stroke's antialiased edge instead of
 * stopping a pixel short of every line on the page.
 */
function fill(
	context: CanvasRenderingContext2D,
	{ color, at }: Extract<PaintCommand, { kind: "fill" }>,
) {
	const { width, height } = context.canvas;
	const start = { x: Math.floor(at.x), y: Math.floor(at.y) };
	if (!inside(start, width, height)) return;

	const image = context.getImageData(0, 0, width, height);
	const pixels = image.data;
	const target = pixelAt(pixels, offset(start.x, start.y, width));
	const ink = rgb(color);
	// Nothing to do, and the edge would still be grown into if we carried on.
	if (near(target, ink)) return;

	/** Every pixel the fill has taken: the area, and later the fade around it. */
	const claimed = new Uint8Array(width * height);
	/**
	 * Where the flood stopped. Collected here rather than by sweeping the
	 * bitmap afterwards because the flood has already tested every one of these
	 * pixels — finding them again would cost more than the fill itself.
	 */
	let edge: number[] = [];

	const queue: Point[] = [start];
	while (queue.length > 0) {
		const seed = queue.pop();
		if (!seed) break;
		if (claimed[seed.y * width + seed.x]) continue;

		let left = seed.x;
		while (left > 0 && open(pixels, claimed, left - 1, seed.y, width, target))
			left--;
		let right = seed.x;
		while (
			right < width - 1 &&
			open(pixels, claimed, right + 1, seed.y, width, target)
		)
			right++;

		// The two ends of the span are edge unless the row ran out first.
		if (left > 0) edge.push(seed.y * width + left - 1);
		if (right < width - 1) edge.push(seed.y * width + right + 1);

		let above = false;
		let below = false;
		for (let x = left; x <= right; x++) {
			claimed[seed.y * width + x] = 1;
			// Safe to paint as we go now that `open` asks `claimed` before it
			// asks the colour: a pixel already taken is refused before anything
			// reads what it has become.
			tint(pixels, offset(x, seed.y, width), target, ink, 1);

			const up =
				seed.y > 0 && open(pixels, claimed, x, seed.y - 1, width, target);
			if (up && !above) queue.push({ x, y: seed.y - 1 });
			else if (!up && seed.y > 0) edge.push((seed.y - 1) * width + x);
			above = up;

			const down =
				seed.y < height - 1 &&
				open(pixels, claimed, x, seed.y + 1, width, target);
			if (down && !below) queue.push({ x, y: seed.y + 1 });
			else if (!down && seed.y < height - 1) edge.push((seed.y + 1) * width + x);
			below = down;
		}
	}

	// Then out into the fade, a ring at a time. Each ring is the unclaimed
	// neighbours of the last, so this walks the edge rather than the bitmap —
	// which is what keeps a fill proportional to the shape it is filling, and
	// an undo (which replays every fill on the page) affordable.
	for (let ring = 0; ring < FILL_FEATHER; ring++) {
		const next: number[] = [];

		for (const index of edge) {
			if (claimed[index]) continue;
			claimed[index] = 1;

			const share = coverage(pixelAt(pixels, index * 4), target);
			if (share > 0) tint(pixels, index * 4, target, ink, share);

			const x = index % width;
			if (x > 0 && !claimed[index - 1]) next.push(index - 1);
			if (x < width - 1 && !claimed[index + 1]) next.push(index + 1);
			if (index >= width && !claimed[index - width]) next.push(index - width);
			const below = index + width;
			if (below < claimed.length && !claimed[below]) next.push(below);
		}

		edge = next;
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

/**
 * Swaps the area's colour for the ink in whatever proportion of the pixel the
 * area held, leaving everything else in it alone.
 *
 * The difference is added rather than the colour replaced, and that is the
 * whole of why the edge comes out clean. A pixel halfway along a stroke's fade
 * is half paper and half ink; adding half the change to it makes it half fill
 * and half ink, which is what it would have been had the stroke been drawn
 * over the fill in the first place. Replacing it instead would throw the
 * stroke's half away and leave the line looking chewed.
 *
 * At `share` of 1 over a pixel that is exactly the area's colour — which is
 * every pixel of the area itself — this comes to the ink, so the area and its
 * edge are painted by one rule.
 */
function tint(
	pixels: Uint8ClampedArray,
	index: number,
	target: Rgb,
	ink: Rgb,
	share: number,
) {
	pixels[index] += (ink[0] - target[0]) * share;
	pixels[index + 1] += (ink[1] - target[1]) * share;
	pixels[index + 2] += (ink[2] - target[2]) * share;
	pixels[index + 3] = 255;
}

/**
 * How much of a pixel still belongs to the area, judged by how far it has
 * drifted from the colour under the bucket: all of it while the pixel is
 * within tolerance, none once it has become the stroke, and the ramp between
 * the two is the antialiased fade itself.
 */
function coverage(pixel: Rgb, target: Rgb) {
	const drift = Math.max(
		Math.abs(pixel[0] - target[0]),
		Math.abs(pixel[1] - target[1]),
		Math.abs(pixel[2] - target[2]),
	);

	if (drift <= FILL_TOLERANCE) return 1;
	if (drift >= FILL_SPREAD) return 0;
	return 1 - (drift - FILL_TOLERANCE) / (FILL_SPREAD - FILL_TOLERANCE);
}

/**
 * Whether the flood may cross this pixel: it is the area's colour, and has not
 * been taken already. The two are asked together because the flood no longer
 * paints as it goes — a pixel it has crossed still looks exactly like one it
 * has not, so `claimed` is what stops it going round for ever.
 */
function open(
	pixels: Uint8ClampedArray,
	claimed: Uint8Array,
	x: number,
	y: number,
	width: number,
	target: Rgb,
) {
	const index = y * width + x;
	return !claimed[index] && near(pixelAt(pixels, index * 4), target);
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
