/**
 * Whether a media query matches, as state.
 *
 * Read in an effect rather than during render because this app server-renders,
 * where there is no `matchMedia` and no viewport to ask about. Both callers
 * want `false` as the server's answer — no reduced-motion preference, a fine
 * pointer — so the first paint is the ordinary case and the client corrects it.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const media = window.matchMedia(query);
		const sync = () => setMatches(media.matches);

		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, [query]);

	return matches;
}
