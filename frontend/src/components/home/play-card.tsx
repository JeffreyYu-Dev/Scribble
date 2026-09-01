import { ArrowRightIcon, PlusIcon, ShuffleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { OnlineCount } from "#/components/home/online-count.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "#/components/ui/field.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group.tsx";
import { randomName } from "#/lib/names.ts";

const NAME_KEY = "scribble:name";
const NAME_MAX = 16;
const CODE_LENGTH = 5;

export function PlayCard() {
	const [name, setName] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const [codeError, setCodeError] = useState<string | null>(null);

	// Read on the client only: the shell is server-rendered.
	useEffect(() => {
		setName(localStorage.getItem(NAME_KEY) ?? randomName());
	}, []);

	function commitName() {
		const trimmed = name.trim();
		if (!trimmed) {
			setNameError("Pick a name before you play.");
			return null;
		}
		setNameError(null);
		localStorage.setItem(NAME_KEY, trimmed);
		return trimmed;
	}

	function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		const player = commitName();
		if (!player) return;
		// TODO: create a lobby on the server, then route to it.
		console.log("create lobby", { player });
	}

	function handleJoin(event: React.FormEvent) {
		event.preventDefault();
		const player = commitName();
		if (code.length !== CODE_LENGTH) {
			setCodeError(`Room codes are ${CODE_LENGTH} characters.`);
			return;
		}
		setCodeError(null);
		if (!player) return;
		// TODO: join the lobby on the server, then route to it.
		console.log("join lobby", { player, code });
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>Start playing</CardTitle>
				<CardDescription>
					Everyone draws, everyone guesses. No account needed.
				</CardDescription>
				<CardAction>
					<OnlineCount />
				</CardAction>
			</CardHeader>

			<CardContent>
				<FieldGroup>
					<form onSubmit={handleCreate}>
						<Field data-invalid={nameError ? true : undefined}>
							<FieldLabel htmlFor="name">Display name</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="name"
									name="name"
									value={name}
									maxLength={NAME_MAX}
									autoComplete="off"
									spellCheck={false}
									placeholder="who are you today?"
									aria-invalid={nameError ? true : undefined}
									onChange={(event) => {
										setName(event.target.value);
										setNameError(null);
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
											setNameError(null);
										}}
									>
										<ShuffleIcon />
									</InputGroupButton>
								</InputGroupAddon>
							</InputGroup>
							{nameError ? (
								<FieldError>{nameError}</FieldError>
							) : (
								<FieldDescription>
									Saved on this device for next time.
								</FieldDescription>
							)}
						</Field>

						<Button type="submit" size="lg" className="mt-4 w-full">
							<PlusIcon data-icon="inline-start" />
							Create a lobby
						</Button>
					</form>

					<FieldSeparator>or</FieldSeparator>

					<form onSubmit={handleJoin}>
						<Field data-invalid={codeError ? true : undefined}>
							<FieldLabel htmlFor="code">Join with a room code</FieldLabel>
							<InputGroup>
								<InputGroupAddon>
									<InputGroupText>#</InputGroupText>
								</InputGroupAddon>
								<InputGroupInput
									id="code"
									name="code"
									value={code}
									maxLength={CODE_LENGTH}
									autoComplete="off"
									spellCheck={false}
									placeholder="A4K9Z"
									className="uppercase tracking-[0.3em]"
									aria-invalid={codeError ? true : undefined}
									onChange={(event) => {
										setCode(
											event.target.value
												.toUpperCase()
												.replace(/[^A-Z0-9]/g, ""),
										);
										setCodeError(null);
									}}
								/>
								<InputGroupAddon align="inline-end">
									<InputGroupButton
										type="submit"
										variant="outline"
										disabled={code.length !== CODE_LENGTH}
									>
										Join
										<ArrowRightIcon data-icon="inline-end" />
									</InputGroupButton>
								</InputGroupAddon>
							</InputGroup>
							{codeError ? <FieldError>{codeError}</FieldError> : null}
						</Field>
					</form>
				</FieldGroup>
			</CardContent>
		</Card>
	);
}
