/**
 * Seconds left on a deadline.
 *
 * The tick lives in a hook rather than in the round store so the re-render it
 * causes every second stays with the one component showing a clock. The store
 * holds the deadline, which only changes when the server says a turn did.
 */

import { useEffect, useState } from "react";

/**
 * Faster than once a second so the number on screen is never a whole second
 * behind: the interval and the deadline are not in step, and a 1000ms tick
 * would show each value for anywhere between 0 and 2 seconds.
 */
const TICK = 250;

/** Whole seconds until `deadline`, or `fallback` when there is nothing to count. */
export function useCountdown(deadline: number | null, fallback = 0) {
	const [seconds, setSeconds] = useState(() => remaining(deadline, fallback));

	useEffect(() => {
		setSeconds(remaining(deadline, fallback));
		if (deadline === null) return;

		const id = setInterval(
			() => setSeconds(remaining(deadline, fallback)),
			TICK,
		);
		return () => clearInterval(id);
	}, [deadline, fallback]);

	return seconds;
}

function remaining(deadline: number | null, fallback: number) {
	if (deadline === null) return fallback;
	return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
