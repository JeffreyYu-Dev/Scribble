import { useNavigate } from "@tanstack/react-router";
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
import { createLobby } from "#/lib/api.ts";
import { randomName } from "#/lib/names.ts";
import {
  CODE_LENGTH,
  errorOf,
  NAME_MAX,
  playerNameSchema,
  roomCodeSchema,
} from "#/lib/schemas.ts";
import { rememberOwnership, savePlayerName } from "#/lib/storage.ts";

const NAME_KEY = "scribble:name";

export function PlayCard() {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const navigate = useNavigate();

  // Read on the client only: the shell is server-rendered. Whatever is in
  // storage is untrusted -- an older build or a hand-edited value could leave
  // something the current rules reject -- so fall back to a fresh name.
  useEffect(() => {
    const stored = playerNameSchema.safeParse(localStorage.getItem(NAME_KEY));
    setName(stored.success ? stored.data : randomName());
  }, []);

  function commitName() {
    const result = playerNameSchema.safeParse(name);
    setNameError(errorOf(result));
    if (!result.success) return null;
    savePlayerName(result.data);
    return result.data;
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const player = commitName();
    if (!player) return;

    setCreating(true);
    setCreateError(null);
    try {
      const lobby = await createLobby(player);
      // Kept out of the URL and handed straight to the socket on the room
      // page: this id is what makes us the owner of the room we just made.
      rememberOwnership(lobby.code, lobby.playerId);
      navigate({ to: "/room", search: { scribble: lobby.code } });
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create a lobby.",
      );
      setCreating(false);
    }
  }

  function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    const player = commitName();
    const room = roomCodeSchema.safeParse(code);
    setCodeError(errorOf(room));
    if (!room.success || !player) return;

    // Joining is just the room page with a code: whether the room exists is
    // settled by the socket there, which is the only thing that can answer.
    navigate({ to: "/room", search: { scribble: room.data } });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Start playing</CardTitle>
        <CardDescription>Start drawing with your friends!</CardDescription>
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
              {nameError && <FieldError>{nameError}</FieldError>}
            </Field>

            <Button
              type="submit"
              size="lg"
              className="mt-4 w-full"
              disabled={creating}
            >
              <PlusIcon data-icon="inline-start" />
              {creating ? "Creating\u2026" : "Create a lobby"}
            </Button>
            {createError ? (
              <FieldError className="mt-2">{createError}</FieldError>
            ) : null}
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
