/**
 * The drawing kit: what the toolbar offers and what it starts on. This is the
 * only place a tool, a brush size or an ink colour is spelled out — the canvas
 * takes them as values, so adding a colour here is the whole change.
 */

import {
	EraserIcon,
	type LucideIcon,
	PaintBucketIcon,
	PencilIcon,
	Trash2Icon,
	Undo2Icon,
} from "lucide-react";

import type { Tool } from "#/lib/drawing/types.ts";

type ToolMeta = { value: Tool; label: string; icon: LucideIcon };

/** The tools that draw with a nib, and so carry a size of their own. */
export type BrushTool = Exclude<Tool, "fill">;

/** The settings: what the next press of the pointer will do. */
export const TOOLS = [
	{ value: "pen", label: "pen", icon: PencilIcon },
	// An eraser is really just a white paint brush.
	{ value: "eraser", label: "eraser", icon: EraserIcon },
	{ value: "fill", label: "fill", icon: PaintBucketIcon },
] as const satisfies readonly ToolMeta[];

/** Not settings but buttons: these change the paper rather than the brush. */
export const ACTIONS = {
	undo: { label: "undo", icon: Undo2Icon },
	clear: { label: "clear canvas", icon: Trash2Icon },
} as const satisfies Record<string, { label: string; icon: LucideIcon }>;

/** Stroke widths in board pixels, smallest first. */
export const BRUSH_SIZES = [4, 8, 12, 16, 20, 24] as const;

export type BrushSize = (typeof BRUSH_SIZES)[number];

/**
 * Two rows of the classic ink tray: a light row over its shaded twin, so a
 * colour and its shadow sit in the same column.
 */
export const PALETTE = [
	[
		"#ffffff",
		"#c1c1c1",
		"#ef130b",
		"#ff7100",
		"#ffe400",
		"#00cc00",
		"#00b2ff",
		"#231fd3",
		"#a300ba",
		"#d37caa",
		"#a0522d",
	],
	[
		"#000000",
		"#4c4c4c",
		"#740b07",
		"#c23800",
		"#e8a200",
		"#005510",
		"#00569e",
		"#0e0865",
		"#550069",
		"#a75574",
		"#63300d",
	],
] as const;

export const DEFAULT_TOOL: Tool = "pen";
export const DEFAULT_COLOR = "#000000";

/** The pen and the eraser each remember their own width. */
export const DEFAULT_BRUSHES: Record<BrushTool, BrushSize> = {
	pen: 8,
	eraser: 8,
};
