package game

import (
	"time"
	"uuid"
)

// outbox is how many frames may be waiting on one player's socket. A broadcast
// must never block on a slow client, so it is buffered; a client that fills it
// is not keeping up with the board and is cut loose instead.
const outbox = 64

// Player is someone in a room. Every field is read and written by that room's
// goroutine and nowhere else, which is why none of them need a lock.
type Player struct {
	Id       uuid.UUID
	Username string
	JoinedAt time.Time

	// Score survives the turn; Gained is what they won in this one, and is
	// cleared when the next starts.
	Score  int
	Gained *int
	// Guessed is set once they have the word this turn.
	Guessed bool

	// frames carries encoded messages to the goroutine writing this player's
	// socket. Closed by the room, and only by the room.
	frames  chan []byte
	dropped bool
}

func CreatePlayer(username string) *Player {
	return CreatePlayerWithId(uuid.New(), username)
}

// CreatePlayerWithId builds a player around an id issued earlier, so the room's
// creator can prove they are the same person when their socket connects.
func CreatePlayerWithId(id uuid.UUID, username string) *Player {
	return &Player{
		Id:       id,
		Username: username,
		JoinedAt: time.Now(),
		frames:   make(chan []byte, outbox),
	}
}

// Frames is what to write to this player's socket. It is closed when the room
// is done with them, which is the signal to hang up.
func (p *Player) Frames() <-chan []byte {
	return p.frames
}

// push queues one frame. Called only from the room's goroutine.
func (p *Player) push(data []byte) {
	if p.dropped {
		return
	}
	select {
	case p.frames <- data:
	default:
		// Dropping the frame instead would leave this player looking at a board
		// nobody else can see, and no later message would repair it. Hanging up
		// is recoverable: the client reconnects and is sent a fresh snapshot.
		p.close()
	}
}

// close ends the player's socket. Idempotent, and only ever called from the
// room's goroutine, so the flag needs no synchronisation.
func (p *Player) close() {
	if p.dropped {
		return
	}
	p.dropped = true
	close(p.frames)
}

// view is the player as the scoreboard sees them. Both ids are the room's, not
// this player's: who holds the pen and who holds the room are what turn the
// same player into a different row.
func (p *Player) view(drawer, owner uuid.UUID) PlayerView {
	status := "guessing"
	switch {
	case p.Id == drawer:
		status = "drawing"
	case p.Guessed:
		status = "guessed"
	}

	return PlayerView{
		Id:     p.Id.String(),
		Name:   p.Username,
		Score:  p.Score,
		Gained: p.Gained,
		Status: status,
		Host:   p.Id == owner,
	}
}
