/**
 * What goes on the paper when there is nothing drawn on it yet.
 *
 * Four screens share this file because they share a moment: the seconds
 * between one turn ending and the next being drawable. The round card opens a
 * round, the drawer picks a word, everyone else watches them do it, and the
 * answer goes up once the turn is over. Which one a player gets is the only
 * decision made here — the rest is the room's, and arrives as props.
 *
 * It covers the sheet rather than replacing it, so the board underneath keeps
 * its size and the canvas is never unmounted mid-turn. The scrim is `bg-card`
 * and not a wash over the paper on purpose: the sheet is white in both themes,
 * and text over it would have to opt out of the theme to stay readable.
 *
 * The screens do not cut between each other. A turn is a loop of these, several
 * times a round, and a hard swap makes the room read as flickering rather than
 * as moving on — so what is up plays out before what is next plays in, and the
 * component holds the old screen for exactly as long as that takes. See
 * `useScreen`, which is the whole of that machinery.
 */

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { PaletteIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GameResults } from "#/components/room/game-results.tsx";
import { TurnReveal } from "#/components/room/turn-reveal.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import type { InkMap } from "#/lib/room/ink.ts";
import type { TurnPhase } from "#/lib/room/round-store.ts";
import type { Player } from "#/lib/room/types.ts";
import { cn } from "#/lib/utils.ts";

/**
 * How long a screen takes to arrive and to leave. Out is quicker than in: the
 * old screen is in the way of the new one, and the room has already moved on
 * by the time it starts to go.
 */
const IN_SECONDS = 0.42;
const OUT_SECONDS = 0.22;

/** Which screen is up. Only ever compared, never rendered. */
type ScreenKey = "intro" | "choosing" | "reveal" | "results";

type TurnOverlayProps = {
  phase: TurnPhase;
  round: number;
  totalRounds: number;
  /** Whether the local player holds the pen this turn. */
  drawing: boolean;
  /** `null` between turns, and while a room waits for a second player. */
  drawerName: string | null;
  /** The words on offer. The drawer's alone; empty for everyone else. */
  choices: string[];
  /** Seconds left on whatever the room is waiting for. */
  secondsLeft: number;
  /** The full length of the phase, which is what the meter drains over. */
  seconds: number;
  /** The word, once the turn is over and everyone may have it. `null` until. */
  answer: string | null;
  /** The roster, for the scoring the reveal reports. In join order. */
  players: Player[];
  /** The room's colours, so the podium dresses everyone as they played. */
  inks: InkMap;
  onPick?: (choice: number) => void;
  /** The round card, which takes the paper for a beat before anything else. */
  intro?: boolean;
  /**
   * The game is over and its result is what the board is for now. It outranks
   * every other screen: there is no next turn for them to be about.
   */
  results?: boolean;
  /**
   * Called once the board has been handed back — the last screen has finished
   * leaving and nothing has replaced it. It is how the room knows it may take
   * the stage away, which it must not do while a screen is still on its way
   * out: unmounting is the one exit no animation survives.
   */
  onEmpty?: () => void;
};

export function TurnOverlay(props: TurnOverlayProps) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Held here rather than in `Curtain` because the screen on its way out is
  // animated from `useScreen`, which runs while that screen is still up and
  // the one replacing it does not exist yet.
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // What the room wants up, which is not always what is up yet.
  const wanted = wantedScreen(props);
  const { key, frame } = useScreen(wanted, reduced, root, card, props.onEmpty);

  if (key === null) return null;

  return (
    <Curtain root={root} card={card} frame={frame} reduced={reduced}>
      {key === "results" ? (
        <GameResults
          players={props.players}
          inks={props.inks}
          reduced={reduced}
        />
      ) : key === "intro" ? (
        <RoundCard round={props.round} totalRounds={props.totalRounds} />
      ) : key === "reveal" ? (
        <TurnReveal
          // The answer is only null in the moment before the reveal lands;
          // holding the empty string keeps the card's shape either way.
          answer={props.answer ?? ""}
          players={props.players}
          reduced={reduced}
        />
      ) : (
        <Choosing {...props} reduced={reduced} />
      )}
    </Curtain>
  );
}

/**
 * Which screen the room is asking for, or `null` for a board that should be
 * left alone. The card wins while it is up: a round opening is worth more than
 * the pick underneath it, and the pick is still there when it lifts.
 */
function wantedScreen({
  results,
  intro,
  phase,
}: TurnOverlayProps): ScreenKey | null {
  if (results) return "results";
  if (intro) return "intro";
  if (phase === "choosing") return "choosing";
  if (phase === "reveal") return "reveal";
  return null;
}

/**
 * The screen that is actually on the paper, which lags the one the room wants
 * by however long the outgoing one takes to leave.
 *
 * `frame` counts the swaps rather than naming them. It is what the curtain's
 * timeline keys off, so a screen replaced by another of the same kind — one
 * reveal after another, which is every turn — still plays in again instead of
 * sitting still because its name did not change.
 */
function useScreen(
  wanted: ScreenKey | null,
  reduced: boolean,
  root: React.RefObject<HTMLDivElement | null>,
  card: React.RefObject<HTMLDivElement | null>,
  onEmpty?: () => void,
) {
  const [shown, setShown] = useState(wanted);
  const [frame, setFrame] = useState(0);

  // Read at the moment the tween finishes rather than when it started, and
  // kept out of the effect below's dependencies: a caller passing an inline
  // arrow would otherwise restart the exit on every render. Declared first so
  // it is already current by the time that effect runs.
  const empty = useRef(onEmpty);
  useEffect(() => {
    empty.current = onEmpty;
  });

  useEffect(() => {
    if (wanted === shown) return;

    const swap = () => {
      setShown(wanted);
      setFrame((n) => n + 1);
      if (wanted === null) empty.current?.();
    };

    // Nothing is up, so there is nothing to take away first.
    if (shown === null || reduced || !card.current) {
      swap();
      return;
    }

    const leaving = gsap.timeline({ onComplete: swap });
    leaving
      .to(card.current, {
        y: -10,
        scale: 0.97,
        autoAlpha: 0,
        duration: OUT_SECONDS,
        ease: "power2.in",
      })
      .to(root.current, { autoAlpha: 0, duration: OUT_SECONDS }, "<0.04");

    return () => {
      leaving.kill();
    };
  }, [wanted, shown, reduced, root, card]);

  return { key: shown, frame };
}

/**
 * The sheet, covered. Opaque enough to read against, and moved in and out so
 * the board is seen to be taken away rather than found missing.
 */
function Curtain({
  root,
  card,
  frame,
  reduced,
  children,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  card: React.RefObject<HTMLDivElement | null>;
  frame: number;
  reduced: boolean;
  children: React.ReactNode;
}) {
  // Keyed on the swap counter and not on the screen's name, so two screens of
  // the same kind in a row — one reveal after another, which is every turn —
  // still play in. `fromTo` rather than `from` on purpose: the outgoing tween
  // left inline styles on these very elements, and only an explicit start
  // value is guaranteed to overwrite them.
  useGSAP(
    () => {
      if (reduced) return;

      gsap
        .timeline()
        .fromTo(
          root.current,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: IN_SECONDS * 0.6, ease: "power2.out" },
        )
        .fromTo(
          card.current,
          { autoAlpha: 0, y: 14, scale: 0.96 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: IN_SECONDS,
            // Overshoots a little and settles, which is what gives the
            // screen some weight on the way in.
            ease: "back.out(1.5)",
          },
          "<",
        );
    },
    { dependencies: [frame, reduced], scope: root, revertOnUpdate: true },
  );

  return (
    <div
      ref={root}
      className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-card/95 p-4 text-center text-card-foreground backdrop-blur-[2px]"
    >
      <div
        ref={card}
        // `will-change` is worth it here and nowhere else on the board: this
        // element is transformed twice every turn, over a canvas that has
        // just stopped being painted into.
        className="flex w-full flex-col items-center gap-3 will-change-transform"
      >
        {children}
      </div>
    </div>
  );
}

/** The round, announced. Nothing else is on screen while this is. */
function RoundCard({
  round,
  totalRounds,
}: {
  round: number;
  totalRounds: number;
}) {
  return (
    <output
      // Read out as one line: the number on its own would be announced
      // without saying what it counts.
      className="flex flex-col items-center gap-1"
      aria-label={`Round ${round} `}
    >
      <span
        aria-hidden
        className="text-2xs tracking-[0.3em] text-muted-foreground uppercase"
      >
        round
      </span>
      <span aria-hidden className="font-heading text-5xl font-medium">
        {round}
      </span>
      {/*<span aria-hidden className="text-xs text-muted-foreground">
        of {totalRounds}
      </span>*/}
    </output>
  );
}

/** The pick, from whichever side of it this player is on. */
function Choosing({
  drawing,
  drawerName,
  choices,
  secondsLeft,
  seconds,
  onPick,
  reduced,
}: TurnOverlayProps & { reduced: boolean }) {
  return (
    <>
      <Meter secondsLeft={secondsLeft} seconds={seconds} />
      {drawing ? (
        <WordChoice choices={choices} onPick={onPick} reduced={reduced} />
      ) : (
        <Waiting drawerName={drawerName} />
      )}
    </>
  );
}

/** The drawer's three words. */
function WordChoice({
  choices,
  onPick,
  reduced,
}: {
  choices: string[];
  onPick?: (choice: number) => void;
  reduced: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);

  // Dealt rather than presented: the words come in one at a time behind the
  // card they are on, which is a beat long enough to read the heading and
  // short enough not to cost the drawer any of their fifteen seconds.
  useGSAP(
    () => {
      if (reduced) return;
      gsap.fromTo(
        row.current?.children ?? [],
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.28,
          ease: "power2.out",
          stagger: 0.07,
          delay: 0.16,
        },
      );
    },
    { dependencies: [reduced, choices.length], scope: row },
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <h2 className="font-heading text-sm font-medium">Choose a word</h2>

      {/*
				Wrapping rather than scrolling: three words is a short row on a
				board and two lines on a phone, and either reads fine.
			*/}
      <div
        ref={row}
        className="flex flex-wrap items-center justify-center gap-2"
      >
        {choices.map((word, index) => (
          <button
            key={word}
            type="button"
            onClick={() => onPick?.(index)}
            className="rounded-md bg-background px-3 py-2 font-heading text-sm font-medium ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
          >
            {word}
          </button>
        ))}
      </div>

      <p className="text-2xs text-muted-foreground">
        one is picked for you if the clock runs out
      </p>
    </div>
  );
}

/** The same moment from the other side of the room. */
function Waiting({ drawerName }: { drawerName: string | null }) {
  return (
    <output className="flex flex-col items-center gap-2">
      <PaletteIcon
        aria-hidden
        className="size-6 animate-pulse text-muted-foreground"
      />
      <p className="text-sm font-medium">
        {drawerName === null
          ? "Picking a word…"
          : `${drawerName} is choosing a word…`}
      </p>
      <p className="text-2xs text-muted-foreground">
        the blanks turn up as soon as they do
      </p>
    </output>
  );
}

/**
 * How much of the pick is left, as a bar rather than a number: the count is
 * already in the top bar's ring, and a second one here would only compete with
 * the words underneath it.
 */
function Meter({
  secondsLeft,
  seconds,
}: {
  secondsLeft: number;
  seconds: number;
}) {
  const left = Math.max(0, Math.min(1, secondsLeft / seconds));
  const low = left <= 0.25;

  return (
    <div
      className="h-0.5 w-28 overflow-hidden rounded-full bg-border"
      role="timer"
      aria-label={`${secondsLeft} seconds left to choose`}
    >
      <div
        style={{ transform: `scaleX(${left})` }}
        className={cn(
          "h-full w-full origin-left rounded-full transition-transform duration-1000 ease-linear",
          low ? "bg-destructive" : "bg-primary",
        )}
      />
    </div>
  );
}
