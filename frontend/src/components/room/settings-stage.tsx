/**
 * The host's dials, on the stage the lobby hands over to.
 *
 * The values are the room's, not this component's: it is given a settings
 * object and reports a new one, exactly like the game picker before it. See
 * `lib/room/settings.ts` for where they are going to live once the protocol
 * carries them.
 */

import { ArrowLeftIcon, PlayIcon } from "lucide-react";

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
import type { MiniGame } from "#/lib/room/games.ts";
import type { GameSettings } from "#/lib/room/settings.ts";
import { SETTING_CHOICES } from "#/lib/room/settings.ts";

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

/**
 * One row per setting, in the order they matter to a room arguing about them.
 * Keeping them as data is what stops four near-identical blocks of markup from
 * drifting apart.
 */
const ROWS: {
  key: keyof GameSettings;
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
          </FieldGroup>
        </ScrollArea>
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {hosting && !canStart ? (
          <span className="mr-auto text-2xs text-muted-foreground">
            waiting for {game.players.min} players
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
