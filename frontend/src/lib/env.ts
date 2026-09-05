/**
 * The environment, checked at the door.
 *
 * Everything a deployment is allowed to change lives here, and nothing else
 * does: the turn length and the round count are the server's, not a
 * deployment's, so they stay in `lib/room/constants.ts` where the Go side can
 * be held against them.
 *
 * The point of parsing rather than reading is where the failure lands. A typo
 * in `VITE_API_URL` is otherwise a `fetch` that quietly resolves nowhere, three
 * layers down and minutes later; here it is one throw at boot.
 *
 * Only `VITE_`-prefixed variables reach the browser — that is Vite's rule, and
 * a good one: anything without the prefix stays on the machine that built the
 * bundle. Nothing secret belongs in here, because everything in here ships.
 */

import { z } from "zod";

const createEnv = () => {
  // Trailing slashes are trimmed here rather than trusted away: every caller
  // joins a path onto these with a slash of its own, and `.../lobby` and
  // `...//lobby` are different URLs to a Go mux — the second one 404s.
  const url = z.string().transform((value) => value.trim().replace(/\/+$/, ""));

  const envSchema = z.object({
    API_URL: url,
    SOCKET_URL: url,
  });

  // Named one at a time rather than handed `import.meta.env` whole: Vite
  // substitutes these textually at build time, and only where it can see the
  // property being read. Spreading the object would leave every one of them
  // `undefined` in a production bundle.
  const { success, data } = envSchema.safeParse({
    API_URL: import.meta.env.VITE_API_URL,
    SOCKET_URL: import.meta.env.VITE_SOCKET_URL,
  });

  if (!success) {
    throw new Error("Invalid env");
  }

  return data ?? {};
};

export const env = createEnv();
