import { cn } from "#/lib/utils.ts";

/**
 * The sheet's pixels, and nothing else. Every prop it needs comes from
 * `useDrawing` — `<Canvas {...canvas} />` — so what is drawn and how it is
 * drawn stay out of the component tree entirely. The cursor arrives that way
 * too: it is the size of the nib, which only the hook has measured.
 */
function Canvas({ className, ...props }: React.ComponentProps<"canvas">) {
	return (
		<canvas
			// `touch-none` hands drags to the pointer handlers; without it a
			// finger would scroll the page instead of leaving a line.
			className={cn("h-full w-full touch-none", className)}
			{...props}
		/>
	);
}

export { Canvas };
