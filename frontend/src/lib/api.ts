/**
 * The one REST call the game makes. Everything after the lobby exists happens
 * over the websocket in `room-provider.tsx`.
 */

import { env } from "#/lib/env.ts";
import { createLobbySchema } from "#/lib/schemas.ts";

/**
 * Creates a lobby and returns its code plus the id that claims ownership of it.
 * The room has no players until someone connects, so a code that is never used
 * is swept by the server rather than lingering.
 */
export async function createLobby(username: string) {
	const response = await fetch(`${env.API_URL}/lobby`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username }),
	});

	if (!response.ok) {
		// The server sends plain text for failures, not JSON.
		const detail = (await response.text()).trim();
		throw new Error(detail || "Could not create a lobby.");
	}

	return createLobbySchema.parse(await response.json());
}
