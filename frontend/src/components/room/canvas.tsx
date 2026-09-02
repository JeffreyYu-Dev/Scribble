import { cn } from "#/lib/utils.ts";

/**
 * The sheet's pixels, and nothing else. Every prop it needs comes from
 * `useDrawing` — `<Canvas {...canvas} />` — so what is drawn and how it is
 * drawn stay out of the component tree entirely.
 */
function Canvas({
	disabled = false,
	className,
	...props
}: React.ComponentProps<"canvas"> & { disabled?: boolean }) {
	return (
		<canvas
			// `touch-none` hands drags to the pointer handlers; without it a
			// finger would scroll the page instead of leaving a line.
			className={cn(
				"h-full w-full touch-none",
				disabled ? "cursor-not-allowed" : "cursor-crosshair",
				className,
			)}
			{...props}
		/>
	);
}

export { Canvas };
