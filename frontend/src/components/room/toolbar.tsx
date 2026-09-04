import type { BrushSize, BrushTool } from "#/components/room/tools.ts";
import {
  ACTIONS,
  BRUSH_SIZES,
  PALETTE,
  TOOLS,
} from "#/components/room/tools.ts";
import { Button } from "#/components/ui/button.tsx";
import { FieldLegend, FieldSet } from "#/components/ui/field.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { PAPER } from "#/lib/drawing/render.ts";
import type { Tool } from "#/lib/drawing/types.ts";
import { cn } from "#/lib/utils.ts";

/**
 * Every control on the bar is this big, so none of them is a small target.
 * Icons are sized on the icon itself: the toggle and button recipes only set a
 * size for svgs that do not carry one.
 */
const CONTROL = "size-10";
const ICON = "size-5";

/**
 * The chosen tool: the theme's green as the chip, the page's background as the
 * icon — so a black icon turns white, and a white one turns black once there
 * is a dark theme to turn it. Only the icon inverts; the green is `--primary`
 * in both themes and stays put.
 *
 * The selector is `aria-checked` and not `data-state`, because a tooltip or
 * hover-card trigger takes `data-state` over for its own open/closed — which
 * is what left the selected tool looking like all the others.
 */
const SELECTED = [
  "aria-checked:border-primary aria-checked:bg-primary aria-checked:hover:bg-primary",
  "aria-checked:text-background aria-checked:hover:text-background",
].join(" ");

type ToolbarProps = {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  color: string;
  onColorChange: (color: string) => void;
  /** The second ink, which the right button draws in. */
  secondary: string;
  onSecondaryChange: (color: string) => void;
  onSwapInks: () => void;
  /** The pen and the eraser keep separate widths. */
  brushes: Record<BrushTool, BrushSize>;
  onBrushChange: (tool: BrushTool, brush: BrushSize) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Whether either stack has anything in it. Greys out the button that has none. */
  canUndo?: boolean;
  canRedo?: boolean;
  onClear?: () => void;
  className?: string;
};

/**
 * The settings for the next stroke — ink, tool, width — plus the buttons that
 * act on the paper instead. It only reports choices; the canvas is what turns
 * them into pixels, and what knows whether there is anything left to undo.
 */
export function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  secondary,
  onSecondaryChange,
  onSwapInks,
  brushes,
  onBrushChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onClear,
  className,
}: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto rounded-lg bg-card p-2 text-card-foreground ring-1 ring-foreground/10 *:shrink-0",
        className,
      )}
    >
      <InkPair
        color={color}
        secondary={secondary}
        brush={brushes}
        tool={tool}
        onSwap={onSwapInks}
      />

      <Palette
        color={color}
        onColorChange={onColorChange}
        secondary={secondary}
        onSecondaryChange={onSecondaryChange}
      />

      <ToggleGroup
        type="single"
        variant="outline"
        size="lg"
        value={tool}
        aria-label="Drawing tool"
        onValueChange={(next) => next && onToolChange(next as Tool)}
      >
        {TOOLS.map(({ value, label, icon: Icon }) => {
          const item = (
            // The key sits on the wrapper below too; React needs it here
            // because this is the element the map returns through.
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className={cn(CONTROL, SELECTED)}
            >
              <Icon className={ICON} />
            </ToggleGroupItem>
          );

          // `value` narrows to the two brush tools here, so only they get a
          // width to pick — a fill has no nib.
          return value === "fill" ? (
            <Tooltip key={value}>
              <TooltipTrigger asChild>{item}</TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ) : (
            <BrushPicker
              key={value}
              tool={value}
              label={label}
              brush={brushes[value]}
              color={color}
              onPick={(next) => {
                // Picking a width is also picking the tool it belongs to:
                // the sizes were reached by pointing at that tool.
                onToolChange(value);
                onBrushChange(value, next);
              }}
            >
              {item}
            </BrushPicker>
          );
        })}
      </ToggleGroup>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-lg"
              className={CONTROL}
              disabled={!canUndo}
              aria-label="Undo the last mark"
              onClick={onUndo}
            >
              <ACTIONS.undo.icon className={ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{ACTIONS.undo.label}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-lg"
              className={CONTROL}
              disabled={!canRedo}
              aria-label="Redo the last undone mark"
              onClick={onRedo}
            >
              <ACTIONS.redo.icon className={ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{ACTIONS.redo.label}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon-lg"
              className={CONTROL}
              aria-label="Clear the canvas"
              onClick={onClear}
            >
              <ACTIONS.clear.icon className={ICON} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{ACTIONS.clear.label}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * The widths for one brush, in a row above its button. Hovering (or tabbing
 * to) the pen opens the pen's row, the eraser its own — which is what keeps
 * the two sizes independent: you can never set one while looking at the other.
 */
function BrushPicker({
  tool,
  label,
  brush,
  color,
  onPick,
  children,
}: {
  tool: BrushTool;
  label: string;
  brush: BrushSize;
  color: string;
  onPick: (brush: BrushSize) => void;
  children: React.ReactNode;
}) {
  // The dot is drawn in the ink the stroke would use, so the row previews the
  // actual mark rather than an abstract size.
  const ink = tool === "eraser" ? PAPER : color;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        className="flex w-auto items-center gap-1 rounded-lg p-1.5"
        aria-label={`${label} size`}
      >
        {BRUSH_SIZES.map((size) => {
          const selected = size === brush;
          return (
            <button
              key={size}
              type="button"
              aria-pressed={selected}
              aria-label={`${size} pixels`}
              onClick={() => onPick(size)}
              className={cn(
                "grid size-10 place-items-center rounded-md border border-transparent transition-colors",
                "outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected && "border-primary bg-primary hover:bg-primary",
              )}
            >
              <span
                className={cn(
                  "rounded-full",
                  // White ink needs an edge of its own to be visible on
                  // either background.
                  ink === PAPER && "ring-1 ring-neutral-400",
                )}
                style={{ width: size, height: size, backgroundColor: ink }}
              />
            </button>
          );
        })}
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * What the brush is loaded with, in one square: the two inks split corner to
 * corner — the left button's above the diagonal, the right button's below —
 * with the nib itself on top at the width it will draw. Clicking swaps the
 * two, which is also the only way to reach the second ink without a right
 * button to press.
 *
 * The nib carries a ring of paper so it stays legible over whichever half it
 * lands on; a black nib on black ink would otherwise be a square with nothing
 * in it. The hairline outside that ring is what keeps a white nib from
 * disappearing into the ring in turn.
 */
function InkPair({
  color,
  secondary,
  brush,
  tool,
  onSwap,
}: {
  color: string;
  secondary: string;
  brush: Record<BrushTool, BrushSize>;
  tool: Tool;
  onSwap: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSwap}
          aria-label={`Swap inks. Drawing in ${color}, right button draws ${secondary}`}
          className={cn(
            CONTROL,
            "relative grid place-items-center overflow-hidden rounded-md ring-1 ring-foreground/10",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundColor: secondary }}
          />
          <span
            aria-hidden
            className="absolute inset-0"
            // The half above the corner-to-corner diagonal.
            style={{
              backgroundColor: color,
              clipPath: "polygon(0 0, 100% 0, 0 100%)",
            }}
          />
          {/*
            A hairline along the join, so two inks that are close together are
            still visibly two.
          */}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom right, transparent calc(50% - 0.5px), color-mix(in oklab, var(--color-foreground) 25%, transparent) 50%, transparent calc(50% + 0.5px))",
            }}
          />

          {/* A fill floods everything it reaches, so it has no nib to show. */}
          {tool === "fill" ? null : (
            <span
              aria-hidden
              className="relative rounded-full"
              style={{
                width: brush[tool],
                height: brush[tool],
                backgroundColor: tool === "eraser" ? PAPER : color,
                boxShadow: `0 0 0 2px ${PAPER}, 0 0 0 3px color-mix(in oklab, var(--color-foreground) 35%, transparent)`,
              }}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>swap inks — right-click draws the second</TooltipContent>
    </Tooltip>
  );
}

/**
 * The ink tray: light shades on the top row, their darker twins beneath. The
 * chosen swatch is ringed in its own colour, held off the tray by a gap so the
 * ring reads as a halo rather than a border.
 */
function Palette({
  color,
  onColorChange,
  secondary,
  onSecondaryChange,
}: {
  color: string;
  onColorChange: (color: string) => void;
  secondary: string;
  onSecondaryChange: (color: string) => void;
}) {
  return (
    <FieldSet>
      <FieldLegend className="sr-only">Ink colour</FieldLegend>
      <div className="grid grid-flow-col grid-rows-2 gap-1 rounded-md p-1.5">
        {PALETTE.flatMap((row) =>
          row.map((swatch) => {
            const selected = swatch === color;
            const second = swatch === secondary;
            return (
              <button
                key={swatch}
                type="button"
                aria-pressed={selected}
                aria-label={
                  second ? `${swatch}, second ink` : swatch
                }
                onClick={() => onColorChange(swatch)}
                // The tray loads both inks, one per button, the same way the
                // board spends them.
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSecondaryChange(swatch);
                }}
                style={{
                  backgroundColor: swatch,
                  // A halo of the swatch's own colour. The outermost
                  // hairline is what keeps white and the palest shades
                  // from disappearing into the tray. The second ink is
                  // marked from the inside instead, so the two never
                  // compete for the same edge.
                  boxShadow: selected
                    ? `0 0 0 2px var(--color-muted), 0 0 0 4px ${swatch}, 0 0 0 5px color-mix(in oklab, var(--color-foreground) 30%, transparent)`
                    : second
                      ? "inset 0 0 0 1px var(--color-background), inset 0 0 0 2px color-mix(in oklab, var(--color-foreground) 45%, transparent)"
                      : undefined,
                }}
                className={cn(
                  "relative size-4 rounded-[3px] outline-none transition-shadow",
                  // Focus is an outline rather than a ring so it survives
                  // the inline shadow the selected swatch carries.
                  "focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                  !selected &&
                    "hover:z-10 hover:ring-2 hover:ring-foreground/30 hover:ring-offset-1 hover:ring-offset-muted",
                  selected && "z-10",
                )}
              />
            );
          }),
        )}
      </div>
    </FieldSet>
  );
}
