package game

/*
Every message that crosses the socket, and nothing else.

Each type here is mirrored by a zod schema in the frontend's
`src/lib/room/protocol.ts`. The two are one protocol written twice, so a change
to either is a change to both. The client parses what it receives, so a field
that goes missing is caught there rather than three components deep — but it is
still a bug, and this file is the other half of the contract.
*/

// The four below have to match `lib/room/constants.ts`.
const (
	TurnSeconds = 80
	TotalRounds = 3
	// ChooseSeconds is how long the drawer has to pick their word before the
	// room picks one for them; RevealSeconds is how long the answer stays up
	// once the turn is over.
	ChooseSeconds = 15
	RevealSeconds = 5
)

// WordChoices is how many words a drawer is dealt to choose between.
const WordChoices = 3

// Hidden is the character an unrevealed letter is masked with. It has to match
// `HIDDEN` in the frontend's protocol.
const Hidden = '_'

// Point is a spot on the board, in the bitmap's own pixels rather than the
// screen's — which is what makes a stroke land in the same place on every
// player's canvas.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// DrawCommand is one change to the paper. The kinds share a struct because the
// server only ever relays them: the fields a kind does not use are omitted, so
// what goes out is the shape the client's schema expects.
type DrawCommand struct {
	Kind   string  `json:"kind"`
	Id     string  `json:"id,omitempty"`
	Color  string  `json:"color,omitempty"`
	Size   float64 `json:"size,omitempty"`
	Points []Point `json:"points,omitempty"`
	At     *Point  `json:"at,omitempty"`
}

// valid rejects a command the board could not draw. It is also what makes the
// `omitempty` above safe: a field a kind needs is never zero, so it is never
// dropped on the way out.
func (c DrawCommand) valid() bool {
	switch c.Kind {
	case "stroke":
		return c.Id != "" && c.Color != "" && c.Size > 0 &&
			len(c.Points) > 0 && len(c.Points) <= maxStrokePoints
	case "fill":
		return c.Color != "" && c.At != nil
	case "clear":
		return true
	case "undo", "redo":
		// Not marks but moves over the marks already made. What they come to is
		// settled by the client's history, which every client runs over the same
		// stream; the server keeps them in the log so a player arriving mid-turn
		// replays them too and lands on the same board.
		return true
	}
	return false
}

// PlayerView is a player as the scoreboard sees them. The room's own Player
// carries a socket and a join time as well, neither of which is anyone's
// business.
type PlayerView struct {
	Id     string `json:"id"`
	Name   string `json:"name"`
	Score  int    `json:"score"`
	Gained *int   `json:"gained"`
	Status string `json:"status"`
	// Host marks whoever holds the room. Omitted rather than sent as false: it
	// is true for exactly one player, and the client defaults the rest.
	Host bool `json:"host,omitempty"`
}

// ScopeGuessed marks a line that only the players who have the word are shown:
// the drawer, and everyone who has already guessed it. It is on the wire so the
// client can draw those lines as the side channel they are — the recipients
// need to know that the players still guessing cannot read them. It has to
// match the scope in the frontend's protocol.
//
// An empty scope is the ordinary feed, which everyone sees.
const ScopeGuessed = "guessed"

// ChatEntry is one line of the feed. `correct` deliberately carries no text and
// `close` is only ever sent to the player who typed it, so the word cannot
// reach a guesser through the transcript.
type ChatEntry struct {
	Kind     string `json:"kind"`
	Id       string `json:"id"`
	PlayerId string `json:"playerId,omitempty"`
	Player   string `json:"player,omitempty"`
	Text     string `json:"text,omitempty"`
	// Scope is who the line was written for. Omitted for the ordinary feed,
	// which is most of it; see ScopeGuessed for the other case. It never
	// widens what a client is sent — the server has already decided that by
	// choosing who to send the line to — it only says which of the two
	// conversations a line the client did receive belongs to.
	Scope string `json:"scope,omitempty"`
}

// TurnView is the turn as one player is allowed to see it: Word is filled in
// for the drawer, and for everyone once the turn is over; Choices only ever for
// the drawer who has to pick from them.
type TurnView struct {
	Round       int `json:"round"`
	TotalRounds int `json:"totalRounds"`
	// Phase is what the room is doing: "choosing" while the drawer picks their
	// word, "drawing" while the clock runs, "reveal" once the turn is over.
	Phase    string  `json:"phase"`
	DrawerId string  `json:"drawerId"`
	Word     *string `json:"word"`
	Hint     string  `json:"hint"`
	// Choices are the words on offer. They go to the drawer alone: two of the
	// three being wrong does not make the third safe to hand a guesser.
	Choices []string `json:"choices,omitempty"`
	// Seconds is how long the phase lasts in full, which is what the timer ring
	// empties over.
	Seconds int `json:"seconds"`
	// EndsIn is deliberately relative: a deadline would need the server's clock
	// and the browser's to agree, and they do not.
	EndsIn int `json:"endsIn"`
}

/* ----------------------------------------------------- server -> client */

// Joined acknowledges the join. Always the first message on a socket, and sent
// again on every reconnect.
type Joined struct {
	Type     string `json:"type"`
	PlayerId string `json:"playerId"`
	Code     string `json:"code"`
	Owner    bool   `json:"owner"`
}

// Snapshot is the whole room in one message, sent straight after Joined. Every
// other message below is an update to it, so a reconnect needs no other repair.
type Snapshot struct {
	Type string `json:"type"`
	// Players is in join order, which is what fixes each player's colour.
	Players []PlayerView `json:"players"`
	Chat    []ChatEntry  `json:"chat"`
	Turn    *TurnView    `json:"turn"`
	// Settings is what the room is set up to play, host or not: everyone is
	// shown the dials, and only the host may turn them.
	Settings Settings `json:"settings"`
}

type PlayersMessage struct {
	Type    string       `json:"type"`
	Players []PlayerView `json:"players"`
}

// SettingsMessage is the room's configuration after the host changed it. It
// carries the settings as sanitized, not as asked for, so what every player
// sees is what the next game will actually be played by.
type SettingsMessage struct {
	Type     string   `json:"type"`
	Settings Settings `json:"settings"`
}

type ChatMessage struct {
	Type  string    `json:"type"`
	Entry ChatEntry `json:"entry"`
}

type TurnMessage struct {
	Type string   `json:"type"`
	Turn TurnView `json:"turn"`
}

// HintMessage gives a letter away. Cheaper than re-sending the whole turn.
type HintMessage struct {
	Type string `json:"type"`
	Hint string `json:"hint"`
}

// IdleMessage says there is no turn running: the room is in the lobby, waiting
// for its host to start a game.
type IdleMessage struct {
	Type string `json:"type"`
}

// DrawMessage carries strokes from the drawer. It is never sent back to the
// drawer, who has already drawn them.
type DrawMessage struct {
	Type     string        `json:"type"`
	Commands []DrawCommand `json:"commands"`
}

// CanvasMessage is the board so far, for a client that arrived mid-turn. It
// replaces whatever the receiver had, so an empty one clears the paper.
type CanvasMessage struct {
	Type     string        `json:"type"`
	Commands []DrawCommand `json:"commands"`
}

type ErrorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

/* ----------------------------------------------------- client -> server */

// JoinRequest is the first message a client sends. It travels over the socket
// rather than the URL so the player id stays out of browser history and request
// logs.
type JoinRequest struct {
	Type     string `json:"type"`
	Code     string `json:"code"`
	Username string `json:"username"`
	// PlayerId is the id POST /lobby issued to the room's creator. Empty for
	// everyone else, who are given a fresh one on join.
	PlayerId string `json:"playerId,omitempty"`
}

// clientMessage is anything a joined player sends. The fields are read
// according to Type; the rest are ignored. "start" carries nothing at all: it
// is the host asking for a game, and the room already knows which one.
type clientMessage struct {
	Type string `json:"type"`
	Text string `json:"text"`
	// Choice is which of the words offered the drawer picked, as an index into
	// the Choices they were sent.
	Choice   int           `json:"choice"`
	Commands []DrawCommand `json:"commands"`
	// Settings is the whole configuration, sent by the host whenever any one
	// of the dials moves. A pointer so a message that carries none is told
	// apart from one asking for every setting to be zero.
	Settings *Settings `json:"settings"`
}
