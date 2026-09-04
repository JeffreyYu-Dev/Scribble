import {
  GhostIcon,
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
  /** Whether there is anything to say: shut while the drawer is picking. */
  canChat?: boolean;
  /**
   * Whether the local player is on the inside of the word — the drawer, or
   * someone who has already guessed it. What they type goes to the others who
   * are, and to nobody else, so the box has to say so before they type it.
   */
  ghost?: boolean;
  className?: string;
};

/**
 * The guess feed. Misses read as ordinary messages; hits, joins and near
 * misses read as markers, so the word itself never leaks into the transcript.
 *
 * The panel is narrow and moves fast, so it leans on two rules to stay
 * readable. The theme's lime is yours and nobody else's — your guesses, and
 * the line that says you got it; everyone else speaks in their own ink, the
 * same colour the scoreboard gives them, and never in lime.
 *
 * The second rule is the one that carries the side channel: a filled bubble is
 * a line the whole room can read, and an unfilled one — dotted, italic, hollow
 * — is a line only the players who have the word can. That is a single
 * distinction laid over the first rather than a second thread, which is the
 * point: the conversation stays in one place, and each line says who is in
 * earshot without being moved out of it. Colour is left saying who spoke, and
 * whether the bubble is filled says who is listening.
 */
export function ChatPanel({
  entries,
  inks,
  onGuess,
  canChat = true,
  ghost = false,
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
      <CardContent className="min-h-0 flex-1 px-0">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport className="px-3">
              {/*
               * `justify-end` is what makes a short feed sit on the
               * guess box rather than hang from the title: the
               * content stretches to the viewport whether or not
               * there is enough of it, and a room three guesses old
               * should still look like a conversation.
               */}
              <MessageScrollerContent className="justify-end gap-2.5 py-1">
                {entries.map((entry, index) => {
                  // A run of guesses from one player is written once and
                  // then continued: repeating the avatar and the name for
                  // every line is what makes a fast feed hard to read.
                  const continued = continues(entries, index);
                  return (
                    <MessageScrollerItem
                      key={entry.id}
                      messageId={entry.id}
                      // The scroller virtualises its rows by default, which
                      // this feed is the wrong shape for. An off-screen row is
                      // laid out at `contain-intrinsic-size` — 10rem, against
                      // a real row of two or three — so a line that has not
                      // been on screen yet is four times its own height until
                      // it renders and collapses to it. On a feed pinned to
                      // its end that reads as the panel shrinking every time
                      // anyone guesses. The store caps the feed at 200 short
                      // rows, so there is nothing here worth virtualising and
                      // the estimate is pure cost.
                      className={cn(
                        "[content-visibility:visible]",
                        continued && "-mt-2",
                      )}
                    >
                      <ChatRow
                        entry={entry}
                        inks={inks}
                        continued={continued}
                      />
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </CardContent>

      <CardFooter>
        <form onSubmit={submit} className="flex w-full flex-col gap-1.5">
          {/*
           * Said before it is typed, not after it is sent. Somebody who has
           * just got the word is about to talk about it, and finding out
           * from a dotted bubble that nobody outside heard them is one
           * message too late.
           */}
          {ghost && canChat ? (
            <p className="flex items-center gap-1.5 px-0.5 text-2xs text-muted-foreground">
              <GhostIcon aria-hidden className="size-3 shrink-0" />
              only the drawer &amp; whoever has the word can read this
            </p>
          ) : null}

          <InputGroup
            // The box is drawn the way the bubbles it produces are: dotted,
            // unfilled, in lime. The difference is then visible from the
            // corner of the eye rather than read, and it is the same
            // difference the feed above is already teaching.
            className={cn(
              ghost &&
                canChat &&
                "border-dotted border-primary/60 bg-transparent dark:bg-transparent",
            )}
          >
            {ghost && canChat ? (
              <InputGroupAddon align="inline-start" className="text-primary/70">
                <GhostIcon />
              </InputGroupAddon>
            ) : null}
            <InputGroupInput
              value={draft}
              disabled={!canChat}
              maxLength={GUESS_MAX}
              autoComplete="off"
              spellCheck={false}
              aria-label={ghost ? "Your message" : "Your guess"}
              placeholder={placeholder(canChat, ghost)}
              onChange={(event) => setDraft(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="icon-xs"
                disabled={!canChat || draft.trim() === ""}
                aria-label={ghost ? "Send message" : "Send guess"}
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

function placeholder(canChat: boolean, ghost: boolean) {
  if (!canChat) return "waiting for the word…";
  return ghost ? "say something — quietly…" : "type your guess…";
}

/**
 * Whether this entry carries on the run of guesses directly above it. A line
 * the room can read never continues one it cannot, however fast the same
 * player typed them: the two went to different sets of people, and folding
 * them into one run would say they went to the same. It also keeps the
 * hollow bubbles from being read as one block with the filled ones.
 */
function continues(entries: ChatEntry[], index: number) {
  const entry = entries[index];
  const previous = entries[index - 1];
  return (
    entry.kind === "guess" &&
    previous?.kind === "guess" &&
    previous.player === entry.player &&
    Boolean(previous.self) === Boolean(entry.self) &&
    hidden(previous) === hidden(entry)
  );
}

/** Whether a line went to the players who have the word and to nobody else. */
function hidden(entry: ChatEntry) {
  return entry.kind === "guess" && entry.scope === "guessed";
}

function ChatRow({
  entry,
  inks,
  continued,
}: {
  entry: ChatEntry;
  inks: InkMap;
  continued: boolean;
}) {
  switch (entry.kind) {
    // Yours: on the near side, in lime, and with no avatar — the empty
    // column beside it is the loudest signal in the panel that a line is
    // yours, and an avatar on both sides is what took that away.
    case "guess":
      return entry.self ? (
        <Message align="end">
          <MessageContent className="gap-1">
            {!continued && (
              <MessageHeader className="gap-1">
                you
                {hidden(entry) && <HiddenMark />}
              </MessageHeader>
            )}
            <Bubble align="end" variant={hidden(entry) ? "outline" : "default"}>
              {/*
               * Yours is lime whether or not the room can read it — losing
               * that would cost more than the outline gains. Hidden, the
               * lime draws the dotted edge instead of filling the bubble.
               */}
              <BubbleContent
                className={cn(hidden(entry) && HIDDEN_BUBBLE)}
                style={hidden(entry) ? whisper("var(--primary)") : undefined}
              >
                {entry.text}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <OtherGuess
          entry={entry}
          ink={inkFor(inks, entry.player)}
          continued={continued}
        />
      );

    // The turn's real news, so it gets the full width of the panel and the
    // guesser's own colour. No tick: the sentence already says as much, and
    // a lime tick would read as another one of your lines.
    case "correct": {
      const ink = inkFor(inks, entry.player);
      return (
        <Marker
          variant="separator"
          style={entry.self ? undefined : { color: ink }}
        >
          <MarkerContent
            style={
              entry.self
                ? undefined
                : {
                    backgroundColor: `color-mix(in oklch, ${ink} 16%, transparent)`,
                  }
            }
            className={cn(
              "rounded-full px-2 py-0.5 font-medium",
              entry.self && "bg-primary text-primary-foreground",
            )}
          >
            {entry.self
              ? "you guessed the word"
              : `${entry.player} guessed the word`}
          </MarkerContent>
        </Marker>
      );
    }

    // Only you ever see this one, so it sits on your side of the thread,
    // under the guess that earned it.
    case "close":
      return (
        <Marker className="justify-end text-ink-2">
          <MarkerIcon>
            <LightbulbIcon />
          </MarkerIcon>
          <MarkerContent>&ldquo;{entry.text}&rdquo; is close!</MarkerContent>
        </Marker>
      );

    // Room noise. Centred and dimmed, so it never competes with a guess.
    default:
      return (
        <Marker className="justify-center text-2xs text-muted-foreground/70">
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

/**
 * Somebody else's guess. Their ink carries the avatar and the name, which is
 * what makes a guess attributable without reading it — the bubble itself stays
 * neutral so the lime ones remain unmistakably yours.
 */
function OtherGuess({
  entry,
  ink,
  continued,
}: {
  entry: Extract<ChatEntry, { kind: "guess" }>;
  ink: string;
  continued: boolean;
}) {
  const aside = hidden(entry);

  return (
    <Message align="start">
      {continued ? (
        // Holds the avatar's column open so a run stays in one line.
        <div aria-hidden className="min-w-8 shrink-0" />
      ) : (
        <MessageAvatar>
          <Avatar size="sm">
            <AvatarFallback
              style={
                // Hollow, like the bubble under it: the avatar is the first
                // thing read in the row, so it is where the aside starts.
                aside
                  ? { color: ink, boxShadow: `inset 0 0 0 1px ${ink}` }
                  : { backgroundColor: ink }
              }
              className={cn(
                "font-medium uppercase",
                aside ? "bg-transparent" : "text-white",
              )}
            >
              {entry.player.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </MessageAvatar>
      )}
      <MessageContent className="gap-1">
        {!continued && (
          <MessageHeader className="gap-1" style={{ color: ink }}>
            {entry.player}
            {aside && <HiddenMark />}
          </MessageHeader>
        )}
        <Bubble align="start" variant={aside ? "outline" : "muted"}>
          <BubbleContent
            className={cn(aside && HIDDEN_BUBBLE)}
            style={aside ? whisper(ink) : undefined}
          >
            {entry.text}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

/**
 * The ghost beside a name. It is the only part of the treatment that survives
 * a screen reader, so it carries the wording the outline can only imply.
 */
function HiddenMark() {
  return (
    <>
      <GhostIcon aria-hidden className="size-3 shrink-0 opacity-70" />
      <span className="sr-only">
        (hidden from the players still guessing)
      </span>
    </>
  );
}

/**
 * What a hidden line is drawn with, over and above the dotted outline: nothing.
 * Every other bubble in the panel is filled — lime for yours, muted for
 * everyone else's — so taking the fill away entirely is the loudest thing that
 * can be said about a line without touching the colour that says who spoke it.
 * A hidden bubble is a hole in the feed with a dotted edge; the card shows
 * straight through it.
 */
function whisper(color: string): React.CSSProperties {
  return {
    borderColor: `color-mix(in oklch, ${color} 70%, transparent)`,
    backgroundColor: "transparent",
  };
}

/**
 * The rest of it, which is not colour and so can be said in classes: a dotted
 * edge rather than a solid one, and the text set in italic — an aside is what
 * a hidden line is, and italic is what an aside has always been set in. Three
 * cues rather than one, because a single subtle one on a fast narrow panel is
 * a cue nobody notices they have learned.
 */
const HIDDEN_BUBBLE = "border-dotted italic";
