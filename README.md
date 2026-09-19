# Scribble

A real-time multiplayer drawing-and-guessing game. One player draws, everyone
else races to guess the word before the clock runs out.

## 🎮 [Play it →](https://scribble-frontend-production.up.railway.app)

**https://scribble-frontend-production.up.railway.app**

Create a room, share the 5-character code, and you're playing. No account, no
install.

---

## How a game works

1. **Someone creates a room** and gets a code. Everyone else joins with it.
2. **The host configures the game** — rounds, turn length, player cap, how many
   hint letters get given away, and where the words come from.
3. **The host starts it.** A room needs at least two players: someone to draw
   and someone to guess.
4. **Each turn**, one player is dealt **3 words** and has **15 seconds** to
   pick one. Say nothing and the room picks for you.
5. **They draw; everyone else guesses** in chat. Guesses are checked against
   the word, and a guess that's one typo away gets a "close!" nudge instead of
   a silent miss.
6. **Letters are revealed** on a schedule as the clock runs down — always
   keeping at least one back, because a fully revealed word isn't a hint.
7. **The word is shown for 5 seconds**, then the next player draws.
8. After every player has drawn in each round, the **final scoreboard** goes up.

### Scoring

| | Points |
|---|---|
| Correct guess | **60** floor + up to **240** scaled by time left |
| Drawing | **30** per player who got it |

So guessing first is worth roughly four times guessing last, but a late guess
is never worth nothing — and a drawer is paid for how many people they got
through to, which rewards drawing clearly rather than picking something nobody
can name.

---

## Features

- **Live shared canvas** — strokes, flood fill, clear, and undo/redo, relayed
  to every player as you draw
- **Join mid-game** — a late arrival replays the turn's draw log and lands on
  exactly the board everyone else is looking at
- **Reconnect** — drop your connection and come back to your seat and score
- **Custom room settings** — 1–10 rounds, 15–300 second turns, up to 24
  players, 0–5 hint letters
- **Custom word banks** — play the built-in list, your own words, or both
  mixed together (up to 200 words per room)
- **Near-miss detection** — one-edit-away guesses get told they're close
- **Custom display names**
- **Sound effects** — tick-down and notification cues
- **Roadmap page** — what's shipped and what's planned, in-app at `/roadmap`

---

## How it's built

**Backend** — Go, with [`coder/websocket`](https://github.com/coder/websocket)
and no other dependency.

The core design decision: **a room is a goroutine.** Everything that changes a
room — a player arriving, a guess, a stroke, a turn expiring — is handled one
at a time by that room's own `run()` loop. There are no mutexes around game
state, because only one goroutine ever touches it.

That falls out of the problem rather than being a style choice. A game's state
is small, deeply interconnected, and driven by a timer as well as by players; a
lock would end up held across most of what happens anyway. Owning the state in
one goroutine instead means the synchronization question simply doesn't come
up.

Time works the same way. The room polls a clock every 500ms rather than arming
timers, so there's nothing to cancel and no stale timer can fire into the turn
that replaced it. A turn that ends because the drawer quit and one that ends
because the clock ran out take the same code path, and they agree on when it
happened.

**Frontend** — React 19, TanStack Router + Start, Tailwind v4, shadcn/ui, GSAP
for animation.

**The protocol is written twice** — Go structs in
`backend/internal/game/protocol.go`, mirrored by zod schemas in
`frontend/src/lib/room/protocol.ts`. The client parses everything it receives,
so a field that goes missing is caught at the socket boundary rather than three
components deep. The two files are one contract, and a change to either is a
change to both.

### Layout

```
scribble/
├── backend/
│   ├── cmd/main.go              server entrypoint, graceful shutdown
│   ├── api/api.go               HTTP + websocket surface, room index
│   └── internal/game/
│       ├── room.go              the room goroutine — the heart of it
│       ├── round.go             turns, word choice, hints, scoring
│       ├── guess.go             matching + Levenshtein near-miss
│       ├── protocol.go          every message that crosses the socket
│       ├── settings.go          host config, sanitized server-side
│       ├── player.go
│       └── words.go             the built-in word list
└── frontend/
    └── src/
        ├── routes/              index, room, roadmap
        ├── lib/room/            protocol, settings, socket client
        ├── components/
        └── hooks/
```

---

## Running it locally

You'll need **Go 1.27+** and **[Bun](https://bun.sh)**.

**Backend** — takes the listen address as its first argument:

```bash
cd backend
go run ./cmd localhost:8080
```

**Frontend:**

```bash
cd frontend
bun install
bun dev          # http://localhost:3000
```

Point the frontend at your local backend with a `frontend/.env`:

```bash
VITE_API_URL=http://localhost:8080
VITE_SOCKET_URL=ws://localhost:8080
```

**Tests:**

```bash
cd backend
go test ./...
```

---

## Deployment

Hosted on [Railway](https://railway.com), deploying automatically from `main`.

| Service | |
|---|---|
| Frontend | https://scribble-frontend-production.up.railway.app |
| Backend | https://scribble-production-c0c2.up.railway.app |

Each service watches its own directory, so a frontend-only commit doesn't
rebuild the backend.

| Service | Variable | Purpose |
|---|---|---|
| frontend | `VITE_API_URL` | Backend HTTP base URL |
| frontend | `VITE_SOCKET_URL` | Backend websocket base URL |
| backend | `SCRIBBLE_ORIGINS` | Comma-separated browser origins allowed past CORS, added to the `localhost:3000` defaults |

`SCRIBBLE_ORIGINS` is listed rather than inferred: to a browser, the frontend's
deployed address is a different origin from the backend's, and both the initial
fetch and the websocket handshake are rejected without it. The same variable is
what makes playing over a LAN work — the other players' browsers load the
frontend from your machine's address, which is again a different origin.
