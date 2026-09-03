/**
 * True for a beat at the top of each round.
 *
 * The round number is the only thing the server says that marks a new round:
 * it changes on the round's first turn and holds for the rest of it, so the
 * card is triggered off a change in it rather than off a message of its own.
 * That also makes it self-limiting — a player who arrives mid-round sees the
 * number they arrived on, not a card announcing a round already underway.
 */

import { useEffect, useRef, useState } from "react";

/** Long enough to read, short enough not to eat into the drawer's pick. */
const ROUND_INTRO_MS = 2200;

export function useRoundIntro(round: number, duration = ROUND_INTRO_MS) {
	const [showing, setShowing] = useState(false);
	// Seeded with the round we mounted on, which is what keeps a mid-game join
	// from announcing a round that started without us.
	const previous = useRef(round);

	useEffect(() => {
		const changed = round !== previous.current;
		previous.current = round;
		// Round 0 is a room with no game in it; there is nothing to announce.
		if (!changed || round < 1) return;

		setShowing(true);
		const id = setTimeout(() => setShowing(false), duration);
		return () => clearTimeout(id);
	}, [round, duration]);

	return showing;
}
