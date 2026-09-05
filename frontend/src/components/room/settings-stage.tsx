/**
 * The host's dials, on the stage the lobby hands over to.
 *
 * The values are the room's, not this component's: it is given a settings
 * object and reports a new one, exactly like the game picker before it. What
 * happens to a reported change is the room's business — the server has the last
 * word on all of it, and what comes back is what the whole room is shown, which
 * is why a player who is not the host reads the same panel with the controls
 * turned off rather than being kept out of it.
 *
 * The word bank is the one thing here that is not a select, and so the one
 * thing with a draft of its own: it is typed a character at a time and would
 * otherwise send a message per keystroke. See `WordBank` at the bottom.
 */

import { ArrowLeftIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldSeparator,
  FieldTitle,
} from "#/components/ui/field.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { MiniGame } from "#/lib/room/games.ts";
import type { GameSettings, NumericSetting } from "#/lib/room/settings.ts";
import {
  bankIsShort,
  formatWordBank,
  MAX_CUSTOM_WORDS,
  MIN_CUSTOM_WORDS,
  parseWordBank,
  SETTING_CHOICES,
  WORD_SOURCES,
} from "#/lib/room/settings.ts";
import { cn } from "#/lib/utils.ts";

type SettingsStageProps = {
  game: MiniGame;
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onBack: () => void;
  onStart: () => void;
  /** Only the host may touch any of this. */
  hosting: boolean;
  /** A room short of players has nothing to start. */
  canStart: boolean;
};

const ROWS: {
  key: NumericSetting;
  label: string;
  description: string;
  format: (value: number) => string;
}[] = [
  {
    key: "rounds",
    label: "Rounds",
    description: "Everyone draws once per round.",
    format: (value) => String(value),
  },
  {
    key: "drawSeconds",
    label: "Draw time",
    description: "How long a turn lasts before the word is given away.",
    format: (value) => `${value}s`,
  },
  {
    key: "maxPlayers",
    label: "Players",
    description: "How many seats the room holds.",
    format: (value) => String(value),
  },
  {
    key: "hints",
    label: "Hints",
    description: "Letters handed out as the clock runs down.",
    format: (value) =>
      value === 0 ? "none" : value === 1 ? "1 letter" : `${value} letters`,
  },
];

export function SettingsStage({
  game,
  settings,
  onChange,
  onBack,
  onStart,
  hosting,
  canStart,
}: SettingsStageProps) {
  const short = bankIsShort(settings);

  return (
    // The floor is for a narrow screen, where the room has no fixed height
    // and the card would otherwise collapse onto its own scroll area.
    <Card size="sm" className="flex min-h-96 flex-1 flex-col lg:min-h-0">
      <CardHeader>
        <CardTitle>Game settings</CardTitle>
        <CardDescription>
          {hosting
            ? `How this room plays ${game.name.toLowerCase()}.`
            : `Waiting for the host to start ${game.name.toLowerCase()}.`}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Change game
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <FieldGroup className="pr-3">
            {ROWS.map((row) => (
              <Field key={row.key} orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{row.label}</FieldTitle>
                  <FieldDescription>{row.description}</FieldDescription>
                </FieldContent>
                <Select
                  disabled={!hosting}
                  value={String(settings[row.key])}
                  onValueChange={(value) =>
                    onChange({ ...settings, [row.key]: Number(value) })
                  }
                >
                  {/*
                    A fixed width, so the four rows line up down the
                    card rather than stepping in and out as the values
                    they are showing change length.
                  */}
                  <SelectTrigger
                    aria-label={row.label}
                    className="w-32 shrink-0 tabular-nums"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTING_CHOICES[row.key].map((choice) => (
                      <SelectItem
                        key={choice}
                        value={String(choice)}
                        className="tabular-nums"
                      >
                        {row.format(choice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Words</FieldTitle>
                <FieldDescription>
                  {WORD_SOURCES.find(
                    (source) => source.id === settings.wordSource,
                  )?.hint ?? ""}
                </FieldDescription>
              </FieldContent>
              <Select
                disabled={!hosting}
                value={settings.wordSource}
                onValueChange={(value) =>
                  onChange({
                    ...settings,
                    wordSource: value as GameSettings["wordSource"],
                  })
                }
              >
                <SelectTrigger aria-label="Words" className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORD_SOURCES.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/*
              Only once the room has said it wants them. A host on the
              built-in list has nothing to type here, and an empty box
              below every lobby is a question nobody asked.
            */}
            {settings.wordSource === "default" ? null : (
              <WordBank
                words={settings.words}
                hosting={hosting}
                short={short}
                onChange={(words) => onChange({ ...settings, words })}
              />
            )}
          </FieldGroup>
        </ScrollArea>
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {hosting && !canStart ? (
          <span className="mr-auto text-2xs text-muted-foreground">
            waiting for {game.players.min} players
          </span>
        ) : short ? (
          // Not a reason to refuse the game — the room falls back to the
          // built-in list — but the host should hear it before the first
          // turn deals a word they did not write.
          <span className="mr-auto text-2xs text-muted-foreground">
            under {MIN_CUSTOM_WORDS} words, so the built-in list is used
          </span>
        ) : null}
        <Button size="lg" onClick={onStart} disabled={!hosting || !canStart}>
          <PlayIcon data-icon="inline-start" />
          Start game
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * How long the host may keep typing before the room is told. The other settings
 * report the moment they change, because a select changes once; this one would
 * otherwise send a message per keystroke.
 */
const COMMIT_MS = 500;

/**
 * The room's own words.
 *
 * The draft is this component's and the list is the room's, which is the whole
 * complication: the box has to keep whatever is being typed — including the
 * half-finished word and the trailing comma that parse to nothing — while still
 * following the room when the list changes underneath it. So the draft is only
 * replaced when the room's list is not what the draft says, which is true on
 * arrival and when another host edits, and false for every keystroke of our own
 * that has just been echoed back.
 */
function WordBank({
  words,
  hosting,
  short,
  onChange,
}: {
  words: string[];
  hosting: boolean;
  short: boolean;
  onChange: (words: string[]) => void;
}) {
  const [draft, setDraft] = useState(() => formatWordBank(words));

  // What the draft last reported, so an echo of our own change can be told from
  // somebody else's. Compared as text rather than by identity: the server sends
  // back a new array every time, and it is the words that matter.
  const reported = useRef(formatWordBank(words));

  useEffect(() => {
    const incoming = formatWordBank(words);
    if (incoming === reported.current) return;
    reported.current = incoming;
    setDraft(incoming);
  }, [words]);

  // Kept in a ref rather than depended on: `onChange` is rebuilt on every
  // render of the stage, and depending on it would restart the pause below
  // every time anything else in the room moved — a busy lobby would keep
  // resetting the timer and the words would never be sent at all.
  const commit = useRef(onChange);
  useEffect(() => {
    commit.current = onChange;
  }, [onChange]);

  // Held rather than sent: the pause is what makes this one message instead of
  // one per letter. Anything still waiting when the stage goes away is dropped
  // — the host left the settings, and the room was never told.
  useEffect(() => {
    const parsed = parseWordBank(draft);
    const next = formatWordBank(parsed);
    if (next === reported.current) return;

    const id = setTimeout(() => {
      reported.current = next;
      commit.current(parsed);
    }, COMMIT_MS);
    return () => clearTimeout(id);
  }, [draft]);

  const count = parseWordBank(draft).length;

  return (
    <Field>
      <FieldContent>
        <FieldTitle>Your word bank</FieldTitle>
        <FieldDescription>
          One per line, or separated by commas. Duplicates are dropped.
        </FieldDescription>
      </FieldContent>

      <Textarea
        aria-label="Your word bank"
        disabled={!hosting}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={
          hosting
            ? "hedgehog\nbroken printer\nthe office kettle"
            : "the host has not added any"
        }
        className="max-h-48 min-h-24"
      />

      {/*
        The count is the only thing here that can be wrong, and it is wrong
        in exactly one way: too few for the room to play them.
      */}
      <FieldDescription
        className={cn("tabular-nums", short && "text-destructive")}
      >
        {count} of {MAX_CUSTOM_WORDS} words
        {short ? ` — ${MIN_CUSTOM_WORDS} needed` : ""}
      </FieldDescription>
    </Field>
  );
}
