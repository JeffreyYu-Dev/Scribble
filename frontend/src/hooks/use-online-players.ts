import { useEffect, useState } from "react";

// TODO: placeholder until the server exposes a presence count. Swap the effect
// below for a fetch or a socket subscription; the `null` return already covers
// the "not known yet" state, so callers won't need to change.
const PLACEHOLDER_COUNT = 1284;

/** Total players connected across every lobby, or `null` while unknown. */
export function useOnlinePlayers() {
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
		setCount(PLACEHOLDER_COUNT);
	}, []);

	return count;
}
