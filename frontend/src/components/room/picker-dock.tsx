/**
 * The handle that opens the game picker, and hides itself the rest of the time.
 *
 * It behaves like the macOS dock: nothing is on screen until the cursor comes
 * down towards the bottom of the panel, at which point the bar rises into
 * reach. The panel it sits in clips its own overflow, so "hidden" is genuinely
 * below the edge rather than merely transparent.
 *
 * Two cases have no cursor to be near, and both simply leave it up: a touch
 * screen, which has no hover at all, and a keyboard, which reaches the button
 * by tabbing to it — so the bar is only ever faded, never `visibility: hidden`,
 * or focus could not land on it to bring it back.
 */

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ChevronUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useMediaQuery } from "#/hooks/use-media-query.ts";
import { cn } from "#/lib/utils.ts";

/**
 * The wake-up zone, measured from the bottom edge of the panel and out from its
 * centre. Wide enough that a cursor heading for the bar arrives to find it
 * already there, tight enough that crossing the panel does not trip it.
 */
const REVEAL_BOTTOM = 96;
const REVEAL_HALF_WIDTH = 200;

/** How far below its resting place the bar waits, in pixels. */
const HIDDEN_Y = 44;

type PickerDockProps = {
	/**
	 * What the cursor is measured against — the panel the dock belongs to. Its
	 * bottom edge is the edge the bar rises from.
	 */
	area: React.RefObject<HTMLElement | null>;
	/** False once the picker is open: there is nothing left to open. */
	armed: boolean;
	onOpen: () => void;
};

export function PickerDock({ area, armed, onOpen }: PickerDockProps) {
	const bar = useRef<HTMLButtonElement>(null);
	const [near, setNear] = useState(false);
	const [focused, setFocused] = useState(false);

	const coarse = useMediaQuery("(pointer: coarse)");
	const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

	useEffect(() => {
		const panel = area.current;
		if (!panel || coarse) return;

		// Whatever the cursor was doing when the picker opened is stale by the
		// time it closes, and would flash the bar in before the first move.
		if (!armed) {
			setNear(false);
			return;
		}

		const move = (event: PointerEvent) => {
			const rect = panel.getBoundingClientRect();
			const centre = rect.left + rect.width / 2;
			setNear(
				rect.bottom - event.clientY < REVEAL_BOTTOM &&
					Math.abs(event.clientX - centre) < REVEAL_HALF_WIDTH,
			);
		};
		const leave = () => setNear(false);

		panel.addEventListener("pointermove", move);
		panel.addEventListener("pointerleave", leave);
		return () => {
			panel.removeEventListener("pointermove", move);
			panel.removeEventListener("pointerleave", leave);
		};
	}, [area, armed, coarse]);

	const shown = armed && (near || focused || coarse);

	useGSAP(
		() => {
			gsap.to(bar.current, {
				y: shown ? 0 : HIDDEN_Y,
				opacity: shown ? 1 : 0,
				duration: reduced ? 0 : shown ? 0.4 : 0.22,
				// Coming up it overshoots a little, the way a dock does; going
				// down it just leaves.
				ease: shown ? "back.out(1.7)" : "power2.in",
			});
		},
		{ dependencies: [shown, reduced] },
	);

	return (
		// The strip is the anchor and never moves; only the bar inside it does.
		<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2">
			<button
				ref={bar}
				type="button"
				onClick={onOpen}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				aria-label="Choose a different game"
				// The resting position, so the bar is already out of sight on the
				// first paint rather than flashing into place once GSAP runs.
				style={{ opacity: 0, transform: `translateY(${HIDDEN_Y}px)` }}
				className={cn(
					"flex h-7 w-28 items-center justify-center rounded-full bg-card/90 text-muted-foreground ring-1 ring-foreground/10 backdrop-blur-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
					// Faded out it is still focusable, but nothing the cursor can
					// hit by accident on its way across the panel.
					shown ? "pointer-events-auto" : "pointer-events-none",
				)}
			>
				<ChevronUpIcon className="size-4" />
			</button>
		</div>
	);
}
