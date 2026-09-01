/**
 * The one REST call the game makes. Everything after the lobby exists happens
 * over the websocket in `room-provider.tsx`.
 */

import { createLobbySchema } from "#/lib/schemas.ts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

/** The socket is served by the same Go process, so it follows the API origin. */
export const SOCKET_URL = `${API_URL.replace(/^http/, "ws")}/scribble`;

/**
 * Creates a lobby and returns its code plus the id that claims ownership of it.
 * The room has no players until someone connects, so a code that is never used
 * is swept by the server rather than lingering.
 */
export async function createLobby(username: string) {
	const response = await fetch(`${API_URL}/lobby`, {
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
