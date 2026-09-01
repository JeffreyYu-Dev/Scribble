import {
	CheckIcon,
	LightbulbIcon,
	LogInIcon,
	LogOutIcon,
	SendIcon,
} from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Bubble, BubbleContent } from "#/components/ui/bubble.tsx";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "#/components/ui/input-group.tsx";
import { Marker, MarkerContent, MarkerIcon } from "#/components/ui/marker.tsx";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageHeader,
} from "#/components/ui/message.tsx";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller.tsx";
import type { ChatEntry } from "#/lib/room.ts";
import { GUESS_MAX, guessSchema } from "#/lib/schemas.ts";
import { cn } from "#/lib/utils.ts";

type ChatPanelProps = {
	entries: ChatEntry[];
	onGuess?: (guess: string) => void;
	/** The drawer cannot guess, and neither can anyone who already has it. */
	canGuess?: boolean;
	className?: string;
};

/**
 * The guess feed. Misses read as ordinary messages; hits, joins and near
 * misses read as markers, so the word itself never leaks into the transcript.
 */
export function ChatPanel({
	entries,
	onGuess,
	canGuess = true,
	className,
}: ChatPanelProps) {
	const [draft, setDraft] = useState("");

	function submit(event: React.FormEvent) {
		event.preventDefault();
		const guess = guessSchema.safeParse(draft);
		if (!guess.success) return;
		onGuess?.(guess.data);
		setDraft("");
	}

	return (
		<Card size="sm" className={cn("flex min-h-0 flex-col", className)}>
			<CardHeader>
				<CardTitle>Chat</CardTitle>
			</CardHeader>

			<CardContent className="min-h-0 flex-1 px-0">
				<MessageScrollerProvider autoScroll>
					<MessageScroller>
						<MessageScrollerViewport className="px-3">
							<MessageScrollerContent className="gap-3 py-1">
								{entries.map((entry) => (
									<MessageScrollerItem
										key={entry.id}
										messageId={entry.id}
										scrollAnchor={entry.kind === "guess" && entry.self}
									>
										<ChatRow entry={entry} />
									</MessageScrollerItem>
								))}
							</MessageScrollerContent>
						</MessageScrollerViewport>
						<MessageScrollerButton />
					</MessageScroller>
				</MessageScrollerProvider>
			</CardContent>

			<CardFooter>
				<form onSubmit={submit} className="w-full">
					<InputGroup>
						<InputGroupInput
							value={draft}
							disabled={!canGuess}
							maxLength={GUESS_MAX}
							autoComplete="off"
							spellCheck={false}
							aria-label="Your guess"
							placeholder={canGuess ? "type your guess…" : "you got it already"}
							onChange={(event) => setDraft(event.target.value)}
						/>
						<InputGroupAddon align="inline-end">
							<InputGroupButton
								type="submit"
								size="icon-xs"
								disabled={!canGuess || draft.trim() === ""}
								aria-label="Send guess"
							>
								<SendIcon />
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
				</form>
			</CardFooter>
		</Card>
	);
}

function ChatRow({ entry }: { entry: ChatEntry }) {
	switch (entry.kind) {
		case "guess":
			return (
				<Message align={entry.self ? "end" : "start"}>
					<MessageAvatar>
						<Avatar size="sm">
							<AvatarFallback className="uppercase">
								{entry.player.slice(0, 1)}
							</AvatarFallback>
						</Avatar>
					</MessageAvatar>
					<MessageContent>
						<MessageHeader>{entry.self ? "you" : entry.player}</MessageHeader>
						<Bubble
							align={entry.self ? "end" : "start"}
							variant={entry.self ? "default" : "muted"}
						>
							<BubbleContent>{entry.text}</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			);

		case "correct":
			return (
				<Marker variant="separator" className="text-primary">
					<MarkerIcon>
						<CheckIcon />
					</MarkerIcon>
					<MarkerContent>{entry.player} guessed the word</MarkerContent>
				</Marker>
			);

		case "close":
			return (
				<Marker>
					<MarkerIcon>
						<LightbulbIcon />
					</MarkerIcon>
					<MarkerContent>&ldquo;{entry.text}&rdquo; is close!</MarkerContent>
				</Marker>
			);

		default:
			return (
				<Marker>
					<MarkerIcon>
						{entry.kind === "join" ? <LogInIcon /> : <LogOutIcon />}
					</MarkerIcon>
					<MarkerContent>
						{entry.player} {entry.kind === "join" ? "joined" : "left"}
					</MarkerContent>
				</Marker>
			);
	}
}
