/**
 * The room, whichever of its three faces it is currently wearing.
 *
 * A room never navigates: the shell — invite bar, roster — stays put, and only
 * the stage in the middle changes. Which stage that is comes from two places,
 * and the split matters. Whether a game is running is the server's call, and
 * arrives as `live`; where the host has got to in the lobby is this component's
 * own, because nothing has been decided yet for the server to have an opinion
 * about.
 *
 * Everything else here is presentational, and deliberately so — it is given a
 * roster, a feed and a word, and has no idea whether they came off a socket or
 * out of the mock file.
 */

import { useEffect, useState } from "react";

import { GamePicker } from "#/components/room/game-picker.tsx";
import { GameStage } from "#/components/room/game-stage.tsx";
import { LobbyStage } from "#/components/room/lobby-stage.tsx";
import { RoomShell } from "#/components/room/room-shell.tsx";
import { RoomSummary } from "#/components/room/room-summary.tsx";
import { SettingsStage } from "#/components/room/settings-stage.tsx";
import { TurnOverlay } from "#/components/room/turn-overlay.tsx";
import { TurnClock, TurnWord } from "#/components/room/turn-status.tsx";
import { useRoundIntro } from "#/hooks/use-round-intro.ts";
import type { DrawCommand } from "#/lib/drawing/types.ts";
import { DEFAULT_GAME_ID, gameById, MINIGAMES } from "#/lib/room/games.ts";
import { inkMap } from "#/lib/room/ink.ts";
import type { TurnPhase } from "#/lib/room/round-store.ts";
import type { GameSettings } from "#/lib/room/settings.ts";
import { DEFAULT_SETTINGS } from "#/lib/room/settings.ts";
import type { ChatEntry, Player } from "#/lib/room/types.ts";

/** Lobby and settings are the host walking towards a game; `game` is the game. */
type Stage = "lobby" | "settings" | "game";

type RoomLayoutProps = {
  code: string;
  /** In join order: the colours are handed out by position. */
  players: Player[];
  chat: ChatEntry[];
  round: number;
  totalRounds: number;
  secondsLeft: number;
  /** The full length of the phase being counted, not always a whole turn. */
  turnSeconds: number;
  /** What the room is doing: picking a word, drawing, or showing the answer. */
  phase: TurnPhase;
  /** What `WordHint` renders — the word, or the mask standing in for it. */
  word: string;
  revealed: number[];
  reveal: boolean;
  /** The words the drawer is picking between. Empty for everyone else. */
  choices: string[];
  /** The drawer taking one of them, by index. */
  onPick?: (choice: number) => void;
  /**
   * Whether a turn is running. The server owns this: a turn starting takes
   * every player to the board wherever they were, and a room falling idle
   * hands them all back to the lobby.
   */
  live: boolean;
  /** Whether the local player is the one who can pick and start a game. */
  hosting: boolean;
  /**
   * The host asking the server for a game. Absent in the placeholder room,
   * which has no server to ask — see the fallback where it is called.
   */
  onStart?: () => void;
  onGuess?: (text: string) => void;
  onCommand?: (command: DrawCommand) => void;
  subscribe?: (apply: (command: DrawCommand) => void) => () => void;
  onLeave?: () => void;
};

export function RoomLayout({
  code,
  players,
  chat,
  round,
  totalRounds,
  secondsLeft,
  turnSeconds,
  phase,
  word,
  revealed,
  reveal,
  choices,
  onPick,
  live,
  hosting,
  onStart,
  onGuess,
  onCommand,
  subscribe,
  onLeave,
}: RoomLayoutProps) {
  const [stage, setStage] = useState<Stage>(live ? "game" : "lobby");
  const [gameId, setGameId] = useState(DEFAULT_GAME_ID);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  // The shelf is not a stage of its own: it sits under the whole room and
  // lifts it away, so the lobby is still what the room is on underneath.
  const [picking, setPicking] = useState(false);

  // Only on the edge, not on every render: between the two the host is free to
  // be halfway through the settings without being dragged back to the lobby.
  useEffect(() => setStage(live ? "game" : "lobby"), [live]);

  const game = gameById(gameId);
  // Built from the roster as given, not from the scoreboard's order: colours
  // follow join order, so nobody's changes when the board reshuffles.
  const inks = inkMap(players);

  const drawer = players.find((player) => player.status === "drawing");
  const you = players.find((player) => player.self);
  const drawing = drawer?.self ?? false;

  // A beat of "round 2" at the top of each round, over the paper the next
  // drawer is about to be handed.
  const intro = useRoundIntro(round);

  return (
    <RoomShell
      code={code}
      players={players}
      inks={inks}
      roster={stage === "game" ? "game" : "lobby"}
      onLeave={onLeave}
      status={
        stage === "game" ? (
          <TurnClock
            round={round}
            totalRounds={totalRounds}
            secondsLeft={secondsLeft}
            turnSeconds={turnSeconds}
            phase={phase}
            drawing={drawing}
            drawerName={drawer?.name ?? null}
          />
        ) : null
      }
      banner={
        // There is a moment after the host starts a game and before the
        // first turn lands where there is no word to show — and another
        // while the drawer is still picking one.
        stage === "game" && word && phase !== "choosing" ? (
          <TurnWord
            word={word}
            revealed={revealed}
            reveal={reveal}
            drawing={drawing}
          />
        ) : null
      }
      aside={
        stage === "lobby" ? (
          <RoomSummary
            game={game}
            players={players.length}
            maxPlayers={settings.maxPlayers}
            hosting={hosting}
          />
        ) : null
      }
      lifted={picking}
      below={
        // Only ever reachable from the lobby, so it is only ever built
        // there: no other stage has a handle that asks for it.
        stage === "lobby" ? (
          <GamePicker
            games={MINIGAMES}
            selected={game}
            hosting={hosting}
            onClose={() => setPicking(false)}
            onSelect={(id) => {
              setGameId(id);
              setPicking(false);
            }}
          />
        ) : null
      }
    >
      {stage === "lobby" ? (
        <LobbyStage
          selected={game}
          hosting={hosting}
          lifted={picking}
          onContinue={() => setStage("settings")}
          onOpenPicker={() => setPicking(true)}
        />
      ) : stage === "settings" ? (
        <SettingsStage
          game={game}
          settings={settings}
          hosting={hosting}
          canStart={players.length >= game.players.min}
          onChange={setSettings}
          onBack={() => setStage("lobby")}
          // Asking is all this does. Whether a game is on is the server's
          // call, and it answers by starting a turn — which takes every
          // player to the board through `live`, the host included. The
          // fallback is the placeholder room, which has no server to ask
          // and so walks itself over instead.
          onStart={() => (onStart ? onStart() : setStage("game"))}
        />
      ) : (
        <GameStage
          chat={chat}
          inks={inks}
          // Nothing is drawn and nothing is guessed until the word is
          // settled, so the board and the guess box are both shut while
          // the pick is on. The box opens again for the reveal, where
          // there is nothing left to give away and plenty to say.
          drawing={drawing && phase === "drawing"}
          canChat={phase !== "choosing"}
          // Whoever has the word is not silenced by having it — the drawer
          // included, who used to have no way to say anything at all. They
          // are moved into a channel the players still guessing cannot
          // read, which lasts exactly as long as the guessing does: once
          // the word is up in the reveal there is nothing left to keep.
          ghost={phase === "drawing" && (drawing || you?.status === "guessed")}
          onGuess={onGuess}
          onCommand={onCommand}
          subscribe={subscribe}
          overlay={
            <TurnOverlay
              phase={phase}
              round={round}
              totalRounds={totalRounds}
              drawing={drawing}
              drawerName={drawer?.name ?? null}
              choices={choices}
              secondsLeft={secondsLeft}
              seconds={turnSeconds}
              onPick={onPick}
              intro={intro}
            />
          }
        />
      )}
    </RoomShell>
  );
}
