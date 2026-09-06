/**
 * The door to a room reached by link.
 *
 * Anyone who came through the home card has already said who they are. A link
 * skips that card entirely and lands on the room's own URL, and the server sets
 * a player's name from the join message and never revisits it — so a room that
 * connected on sight would have them in it under a name they never chose and
 * cannot change. This is the last moment where the answer still matters, and
 * nothing opens a socket until it has one.
 */

import { ArrowRightIcon, ShuffleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group.tsx";
import { randomName } from "#/lib/names.ts";
import { errorOf, NAME_MAX, playerNameSchema } from "#/lib/schemas.ts";
import { rememberJoinName, savePlayerName, storedName } from "#/lib/storage.ts";

type JoinGateProps = {
	code: string;
	/** Handed the settled name, which is the room's cue to connect. */
	onJoin: (name: string) => void;
};

export function JoinGate({ code, onJoin }: JoinGateProps) {
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);

	// Read on the client only: the shell is server-rendered, where none of this
	// storage exists. A name from a previous game is a suggestion, not an
	// answer — the field is what settles it.
	useEffect(() => {
		setName(storedName() ?? randomName());
	}, []);

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		const result = playerNameSchema.safeParse(name);
		setError(errorOf(result));
		if (!result.success) return;

		savePlayerName(result.data);
		// Written before the room is told, so a reload mid-game reads it back and
		// goes straight in rather than stopping at this card a second time.
		rememberJoinName(code, result.data);
		onJoin(result.data);
	}

	return (
		<main className="flex min-h-svh items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Joining a room</CardTitle>
					<CardDescription className="flex items-center gap-2">
						You&rsquo;ve been invited to
						<Badge variant="outline" className="tracking-[0.2em] uppercase">
							{code}
						</Badge>
					</CardDescription>
				</CardHeader>

				<CardContent>
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<Field data-invalid={error ? true : undefined}>
							<FieldLabel htmlFor="name">Display name</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="name"
									name="name"
									value={name}
									maxLength={NAME_MAX}
									autoComplete="off"
									spellCheck={false}
									// The only thing on the page worth doing, and a room is
									// waiting on it.
									autoFocus
									placeholder="who are you today?"
									aria-invalid={error ? true : undefined}
									onChange={(event) => {
										setName(event.target.value);
										setError(null);
									}}
								/>
								<InputGroupAddon align="inline-end">
									<InputGroupText className="tabular-nums">
										{name.length}/{NAME_MAX}
									</InputGroupText>
									<InputGroupButton
										size="icon-xs"
										aria-label="Shuffle name"
										onClick={() => {
											setName(randomName());
											setError(null);
										}}
									>
										<ShuffleIcon />
									</InputGroupButton>
								</InputGroupAddon>
							</InputGroup>
							{error ? <FieldError>{error}</FieldError> : null}
						</Field>

						<Button type="submit" size="lg" className="w-full">
							Join room
							<ArrowRightIcon data-icon="inline-end" />
						</Button>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
