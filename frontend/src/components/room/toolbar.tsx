import {
	EraserIcon,
	PaintBucketIcon,
	PencilIcon,
	Trash2Icon,
	Undo2Icon,
} from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { FieldLegend, FieldSet } from "#/components/ui/field.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import type { BrushSize, Tool } from "#/lib/room.ts";
import { BRUSH_SIZES, PALETTE } from "#/lib/room.ts";
import { cn } from "#/lib/utils.ts";

const TOOLS = [
	{ value: "pen", label: "pen", icon: PencilIcon },
	{ value: "eraser", label: "eraser", icon: EraserIcon },
	{ value: "fill", label: "fill", icon: PaintBucketIcon },
] satisfies { value: Tool; label: string; icon: typeof PencilIcon }[];

/** The dot preview caps out here so the widest brush still fits its button. */
const DOT_MAX = 16;

type ToolbarProps = {
	tool: Tool;
	onToolChange: (tool: Tool) => void;
	color: string;
	onColorChange: (color: string) => void;
	brush: BrushSize;
	onBrushChange: (brush: BrushSize) => void;
	onUndo?: () => void;
	onClear?: () => void;
	/** Everything greys out while someone else holds the pen. */
	disabled?: boolean;
	className?: string;
};

export function Toolbar({
	tool,
	onToolChange,
	color,
	onColorChange,
	brush,
	onBrushChange,
	onUndo,
	onClear,
	disabled = false,
	className,
}: ToolbarProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 overflow-x-auto rounded-lg bg-card p-2 text-card-foreground ring-1 ring-foreground/10 [&>*]:shrink-0",
				disabled && "opacity-60",
				className,
			)}
		>
			<CurrentInk color={color} brush={brush} tool={tool} />

			<Palette
				color={color}
				onColorChange={onColorChange}
				disabled={disabled}
			/>

			<Separator orientation="vertical" className="h-8" />

			<ToggleGroup
				type="single"
				variant="outline"
				size="lg"
				value={tool}
				disabled={disabled}
				aria-label="Drawing tool"
				onValueChange={(next) => next && onToolChange(next as Tool)}
			>
				{TOOLS.map(({ value, label, icon: Icon }) => (
					<Tooltip key={value}>
						<TooltipTrigger asChild>
							<ToggleGroupItem value={value} aria-label={label}>
								<Icon />
							</ToggleGroupItem>
						</TooltipTrigger>
						<TooltipContent>{label}</TooltipContent>
					</Tooltip>
				))}
			</ToggleGroup>

			<Separator orientation="vertical" className="h-8" />

			<ToggleGroup
				type="single"
				variant="outline"
				size="lg"
				value={String(brush)}
				disabled={disabled}
				aria-label="Brush size"
				onValueChange={(next) =>
					next && onBrushChange(Number(next) as BrushSize)
				}
			>
				{BRUSH_SIZES.map((size) => (
					<Tooltip key={size}>
						<TooltipTrigger asChild>
							<ToggleGroupItem
								value={String(size)}
								aria-label={`${size} pixels`}
							>
								<span
									className="bg-foreground rounded-full"
									style={{
										width: Math.min(size, DOT_MAX),
										height: Math.min(size, DOT_MAX),
									}}
								/>
							</ToggleGroupItem>
						</TooltipTrigger>
						<TooltipContent>{size}px</TooltipContent>
					</Tooltip>
				))}
			</ToggleGroup>

			<div className="ml-auto flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="icon-lg"
							disabled={disabled}
							aria-label="Undo the last stroke"
							onClick={onUndo}
						>
							<Undo2Icon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>undo</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="destructive"
							size="icon-lg"
							disabled={disabled}
							aria-label="Clear the canvas"
							onClick={onClear}
						>
							<Trash2Icon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>clear canvas</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

/** What the next stroke will look like: the chosen ink at the chosen width. */
function CurrentInk({
	color,
	brush,
	tool,
}: {
	color: string;
	brush: BrushSize;
	tool: Tool;
}) {
	const erasing = tool === "eraser";

	return (
		<div
			aria-hidden
			className="grid size-8 shrink-0 place-items-center rounded-md bg-white ring-1 ring-foreground/10"
		>
			<span
				className={cn("rounded-full", erasing && "ring-1 ring-neutral-300")}
				style={{
					width: Math.min(brush, 24),
					height: Math.min(brush, 24),
					backgroundColor: erasing ? "#ffffff" : color,
				}}
			/>
		</div>
	);
}

/**
 * The ink tray: light shades on the top row, their darker twins beneath. The
 * selected swatch is ringed with an offset rather than an inset border, so the
 * marker stays visible on white and black alike.
 */
function Palette({
	color,
	onColorChange,
	disabled,
}: {
	color: string;
	onColorChange: (color: string) => void;
	disabled: boolean;
}) {
	return (
		<FieldSet>
			<FieldLegend className="sr-only">Ink colour</FieldLegend>
			<div className="grid grid-flow-col grid-rows-2 gap-0.5 rounded-md bg-muted p-1">
				{PALETTE.flatMap((row) =>
					row.map((swatch) => (
						<button
							key={swatch}
							type="button"
							aria-pressed={swatch === color}
							aria-label={swatch}
							disabled={disabled}
							onClick={() => onColorChange(swatch)}
							style={{ backgroundColor: swatch }}
							className={cn(
								"relative size-4 rounded-[3px] outline-none ring-offset-muted transition-shadow",
								"hover:z-10 hover:ring-2 hover:ring-foreground/30 hover:ring-offset-1",
								"focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
								swatch === color && "z-10 ring-2 ring-foreground ring-offset-1",
							)}
						/>
					)),
				)}
			</div>
		</FieldSet>
	);
}
