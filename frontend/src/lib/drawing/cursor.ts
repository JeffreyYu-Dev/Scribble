/**
 * The pointer, drawn as the mark it is about to make.
 *
 * A brush is a ring the exact width of its nib, so the cursor covers precisely
 * the pixels the next press would touch; the fill, which has no width, is its
 * own icon hung off a crosshair on the one pixel it is sampling. Both are SVG
 * data URIs rather than files, because the ring's size is not known until the
 * board has been laid out — see `useDrawing`, which measures the sheet.
 *
 * Every line is painted twice, a white halo under a black line, so a cursor
 * stays visible over black ink and over blank paper alike.
 */

/** What a cursor falls back to: still a precise point, just not a shaped one. */
const FALLBACK = "crosshair";

/** Browsers drop a cursor image past this square. Ours never reach it. */
const MAX_CURSOR = 128;

type Ink = { color: string; width: number };

const HALO: Ink = { color: "#ffffff", width: 3 };
const LINE: Ink = { color: "#000000", width: 1.25 };

/**
 * The ring a pen or an eraser lays down, in *screen* pixels — the caller
 * converts from board pixels, since only it knows how far the sheet is
 * stretched.
 */
export function brushCursor(diameter: number): string {
	// Under a few pixels a ring stops being a shape at all, so the nib is drawn
	// at a floor that still reads as a circle.
	const radius = Math.max(diameter, 3) / 2;
	// An even box puts the hotspot on a whole pixel, which is the only thing a
	// hotspot may be. The padding is the halo's own width.
	const box = 2 * Math.ceil(radius + HALO.width / 2 + 1);
	if (box > MAX_CURSOR) return FALLBACK;

	const centre = box / 2;
	const ring = (stroke: Ink) =>
		`<circle cx="${centre}" cy="${centre}" r="${radius}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}"/>`;

	return `${url(box, ring(HALO) + ring(LINE))} ${centre} ${centre}, ${FALLBACK}`;
}

/** Lucide's `paint-bucket`, as path data — the toolbar shows the same icon. */
const BUCKET = [
	"M11 7 6 2",
	"M18.992 12H2.041",
	"M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595",
	"m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33",
];

/** Where the crosshair crosses, and so which pixel the flood starts from. */
const HOTSPOT = 6;
/** The icon is hung down and to the right of the hotspot, clear of it. */
const BUCKET_SCALE = 0.8;

function bucketMarks({ color, width }: Ink) {
	// The icon is drawn at 24 and shrunk, so its own width is scaled back up to
	// land on the page at the same weight as the crosshair beside it.
	const icon = BUCKET.map((d) => `<path d="${d}"/>`).join("");
	return [
		`<g stroke="${color}" stroke-width="${width}">`,
		`<path d="M${HOTSPOT} 1v10"/><path d="M1 ${HOTSPOT}h10"/>`,
		`<g transform="translate(11 11) scale(${BUCKET_SCALE})" stroke-width="${width / BUCKET_SCALE}">${icon}</g>`,
		"</g>",
	].join("");
}

/** The fill's pointer. Fixed, so it is built the once. */
export const FILL_CURSOR = `${url(
	32,
	bucketMarks(HALO) + bucketMarks(LINE),
	'fill="none" stroke-linecap="round" stroke-linejoin="round"',
)} ${HOTSPOT} ${HOTSPOT}, ${FALLBACK}`;

/**
 * A square of SVG as something `cursor` will take. Encoded rather than base64'd
 * so the markup stays legible in the inspector.
 */
function url(box: number, marks: string, attrs = "") {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" ${attrs}>${marks}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
