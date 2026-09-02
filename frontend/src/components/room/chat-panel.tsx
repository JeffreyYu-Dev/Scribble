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
import type { InkMap } from "#/lib/room/ink.ts";
import { inkFor } from "#/lib/room/ink.ts";
import type { ChatEntry } from "#/lib/room/types.ts";
import { GUESS_MAX, guessSchema } from "#/lib/schemas.ts";
import { cn } from "#/lib/utils.ts";

type ChatPanelProps = {
	entries: ChatEntry[];
	/** The room's colours, keyed by name. Shared with the scoreboard. */
	inks: InkMap;
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
	inks,
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
										<ChatRow entry={entry} inks={inks} />
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

function ChatRow({ entry, inks }: { entry: ChatEntry; inks: InkMap }) {
	switch (entry.kind) {
		case "guess": {
			// Everyone but you wears their own ink, which is the same colour the
			// scoreboard gives them — so a guess is attributable without reading
			// the name. Your own row is already marked by side and bubble colour.
			const ink = inkFor(inks, entry.player);
			return (
				<Message align={entry.self ? "end" : "start"}>
					<MessageAvatar>
						<Avatar size="sm">
							<AvatarFallback
								style={entry.self ? undefined : { backgroundColor: ink }}
								className={cn(
									"uppercase",
									!entry.self && "font-medium text-white",
								)}
							>
								{entry.player.slice(0, 1)}
							</AvatarFallback>
						</Avatar>
					</MessageAvatar>
					<MessageContent>
						<MessageHeader
							style={entry.self ? undefined : { color: ink }}
							className={cn(!entry.self && "opacity-90")}
						>
							{entry.self ? "you" : entry.player}
						</MessageHeader>
						<Bubble
							align={entry.self ? "end" : "start"}
							variant={entry.self ? "default" : "muted"}
						>
							<BubbleContent>{entry.text}</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			);
		}

		case "correct":
			return (
				<Marker
					variant="separator"
					className="text-primary before:bg-primary/40 after:bg-primary/40"
				>
					<MarkerIcon>
						<CheckIcon />
					</MarkerIcon>
					<MarkerContent className="rounded-full bg-primary/15 px-2 py-0.5 font-medium">
						{entry.player} guessed the word
					</MarkerContent>
				</Marker>
			);

		case "close":
			return (
				<Marker className="text-ink-2">
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
