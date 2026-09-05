package game

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"slices"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
	"uuid"
)

/*
A room is a goroutine.

Everything that changes a room — a player arriving, a guess, a stroke, a turn
running out — is handled by run() below, one at a time. That is the whole
concurrency design: the state a game keeps is small, deeply interconnected and
touched by a timer as well as by its players, and a lock around it would have to
be held across most of what happens anyway. Owning it in one goroutine instead
means none of the fields under "owned by run()" need synchronising at all.

The only thing anyone outside may read is `population`, because the sweeper has
to be able to tell an abandoned lobby from a live game without stopping it.
*/

// CodeLength is the number of characters in a room code. It has to match
// CODE_LENGTH in the frontend's schemas.ts, which masks the join input.
const CodeLength = 5

const (
	// tick is how often the room looks at the clock. Everything that happens
	// because time passed goes through it, so there are no timers to cancel and
	// no stale one can fire into the turn that replaced it.
	tick = 500 * time.Millisecond

	// MinPlayers is what a game needs: someone to draw and someone to guess.
	MinPlayers = 2

	// How long the drawer has to choose, and how long the word stays up between
	// turns. There is no third pause: a room does not start itself, so nothing
	// is being counted down in the lobby.
	choosePause = ChooseSeconds * time.Second
	revealPause = RevealSeconds * time.Second

	// Bounds on what one client can make a room hold.
	maxChatHistory  = 50
	maxCanvas       = 4096
	maxStrokePoints = 4096
	maxBatch        = 256
	maxGuess        = 60
	recentWords     = 16

	// inboxSize is how far a room may fall behind its players. A drawer sends
	// one batch a frame, so this is a few frames' grace before senders block —
	// which is the right answer anyway: backpressure, not a dropped stroke.
	inboxSize = 256
)

// ErrRoomClosed is returned by Join when the room is gone. Rooms are deleted
// the moment their last player leaves, so a code can go stale between being
// looked up and being joined.
var ErrRoomClosed = errors.New("room is closed")

// ErrRoomFull is returned by Join when the room has as many players in it as
// its host set it to hold. The room's creator is exempt: the seat they reserved
// was theirs before anyone else took one.
var ErrRoomFull = errors.New("room is full")

type phase int

const (
	// phaseIdle is a room with no turn running: waiting for players, or between
	// games. phaseChoosing is the drawer picking their word, with the paper
	// blank. phaseReveal is the word on screen after a turn, before the next.
	phaseIdle phase = iota
	phaseChoosing
	phaseDrawing
	phaseReveal
)

// name is the phase as the client knows it, and the only place the two spell it
// the same way.
func (p phase) name() string {
	switch p {
	case phaseChoosing:
		return "choosing"
	case phaseDrawing:
		return "drawing"
	case phaseReveal:
		return "reveal"
	}
	return "idle"
}

type Room struct {
	Id        uuid.UUID
	Code      string
	CreatedAt time.Time

	// population is the one piece of room state readable from outside.
	population atomic.Int64

	inbox   chan command
	closing chan struct{}
	done    chan struct{}
	once    sync.Once

	// Everything below belongs to run() and is touched by no other goroutine.

	players map[uuid.UUID]*Player
	// order is join order, which is what fixes each player's colour in the UI.
	order []uuid.UUID
	// reserved is the id POST /lobby handed the room's creator, and is spent
	// the moment they connect. owner is who holds the room right now, which is
	// not the same thing: somebody has to own it while the creator is still on
	// their way, and the creator still gets it when they arrive.
	reserved   uuid.UUID
	owner      uuid.UUID
	everJoined bool

	// settings is what the host has the room set up to play. Only the host may
	// change it, and only between games — see updateSettings.
	settings Settings

	chat    []chatLine
	chatSeq int
	canvas  []DrawCommand

	phase  phase
	round  int
	drawer uuid.UUID
	// drawn is who has already held the pen this round.
	drawn map[uuid.UUID]bool
	word  string
	// choices are the words the drawer is picking between, and are emptied the
	// moment one of them becomes the word.
	choices []string
	hint    []rune
	recent  []string
	hintsAt []time.Time
	// deadline is what the current phase is waiting for.
	deadline time.Time
}

func CreateRoom() (*Room, error) {
	code, err := newCode()
	if err != nil {
		return nil, err
	}

	return &Room{
		Id:        uuid.New(),
		Code:      code,
		CreatedAt: time.Now(),
		inbox:     make(chan command, inboxSize),
		closing:   make(chan struct{}),
		done:      make(chan struct{}),
		players:   make(map[uuid.UUID]*Player),
		drawn:     make(map[uuid.UUID]bool),
		settings:  DefaultSettings(),
	}, nil
}

func newCode() (string, error) {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"

	code := make([]byte, CodeLength)
	for i := range CodeLength {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(characters))))
		if err != nil {
			return "", err
		}
		code[i] = characters[n.Int64()]
	}
	return string(code), nil
}

// SetOwner reserves the room for a player id before that player has connected.
// It has to be called before Start: afterwards the room's own goroutine owns
// this field, and nobody else may write it.
func (r *Room) SetOwner(id uuid.UUID) { r.reserved = id }

// Population is how many players are in the room. Safe from any goroutine.
func (r *Room) Population() int { return int(r.population.Load()) }

// Start runs the room. onEmpty is called once, when it stops, and is where the
// server drops it from its indexes.
func (r *Room) Start(onEmpty func()) { go r.run(onEmpty) }

// Shutdown stops a room that still has players in it: a swept lobby, or the
// whole server going away. Safe to call more than once.
func (r *Room) Shutdown() {
	r.once.Do(func() { close(r.closing) })
}

func (r *Room) run(onEmpty func()) {
	defer onEmpty()
	// Closed last, so anything waiting on it knows the room will handle nothing
	// further.
	defer close(r.done)

	ticker := time.NewTicker(tick)
	defer ticker.Stop()

	for {
		select {
		case <-r.closing:
			for _, p := range r.players {
				p.close()
			}
			return
		case cmd := <-r.inbox:
			cmd.apply(r)
		case now := <-ticker.C:
			r.advance(now)
		}

		// A room outlives its last player only before anyone has arrived: a
		// lobby exists between POST /lobby and its creator's socket opening,
		// and is reclaimed by the sweeper rather than here.
		if r.everJoined && len(r.players) == 0 {
			return
		}
	}
}

/* ------------------------------------------------------------- the way in */

// A command is the only way into a room from outside. Each is applied by the
// room's own goroutine, which is what makes the state it touches lock-free.
type command interface{ apply(*Room) }

type joinCommand struct {
	username string
	// claim is the id POST /lobby issued to the creator, or the nil UUID.
	claim uuid.UUID
	reply chan joinResult
}

type joinResult struct {
	player *Player
	owner  bool
	// err is why the room would not take them, and is the only field set when
	// it is non-nil.
	err error
}

type leaveCommand struct{ id uuid.UUID }

type frameCommand struct {
	from uuid.UUID
	data []byte
}

// inspect runs fn on the room's goroutine. It exists so tests can read state
// that belongs to nobody else.
type inspectCommand struct {
	fn   func(*Room)
	done chan struct{}
}

// Join puts a player in the room and returns them, along with whether they own
// it. The player's Frames channel already holds their acknowledgement and the
// room snapshot by the time this returns.
func (r *Room) Join(username string, claim uuid.UUID) (*Player, bool, error) {
	reply := make(chan joinResult, 1)
	cmd := joinCommand{username: username, claim: claim, reply: reply}

	select {
	case r.inbox <- cmd:
	case <-r.done:
		return nil, false, ErrRoomClosed
	}

	select {
	case res := <-reply:
		return res.player, res.owner, res.err
	case <-r.done:
		return nil, false, ErrRoomClosed
	}
}

// Leave drops a player. Safe to call for a player already gone.
func (r *Room) Leave(p *Player) {
	select {
	case r.inbox <- leaveCommand{id: p.Id}:
	case <-r.done:
	}
}

// Receive hands the room one frame from a player.
func (r *Room) Receive(p *Player, data []byte) {
	select {
	case r.inbox <- frameCommand{from: p.Id, data: data}:
	case <-r.done:
	}
}

func (r *Room) inspect(fn func(*Room)) {
	done := make(chan struct{})
	select {
	case r.inbox <- inspectCommand{fn: fn, done: done}:
	case <-r.done:
		return
	}
	select {
	case <-done:
	case <-r.done:
	}
}

func (c inspectCommand) apply(r *Room) {
	c.fn(r)
	close(c.done)
}

func (c joinCommand) apply(r *Room) {
	// The creator sends back the id POST /lobby issued them, and it buys them
	// the room whenever they arrive. Everyone else joins under a fresh id —
	// including a second socket claiming an id already in the room, which would
	// otherwise give one player two seats.
	id := uuid.New()
	creator := false
	if c.claim != uuid.Nil() && c.claim == r.reserved {
		if _, taken := r.players[c.claim]; !taken {
			id, creator = c.claim, true
		}
	}

	// The host's cap on the room, enforced at the door rather than by throwing
	// anyone out later — which is also why lowering it below the people already
	// seated does nothing (see Settings.sanitize). The creator is let in
	// regardless: their seat was reserved before anybody else took one, and a
	// room whose owner cannot get into it has nobody to change the cap.
	if !creator && len(r.players) >= r.settings.MaxPlayers {
		c.reply <- joinResult{err: ErrRoomFull}
		return
	}

	player := CreatePlayerWithId(id, c.username)
	r.players[id] = player
	r.order = append(r.order, id)
	r.everJoined = true
	r.population.Store(int64(len(r.players)))

	switch {
	case creator:
		// Spent: the reservation was for this one arrival, and the room is
		// theirs even if someone else has been holding it.
		r.reserved = uuid.Nil()
		r.owner = id
	default:
		// Somebody has to own a room that is occupied.
		if _, ok := r.players[r.owner]; !ok {
			r.promoteOwner()
		}
	}

	c.reply <- joinResult{player: player, owner: r.owner == id}

	// Sent before the join is announced, so the newcomer sees their own arrival
	// once — as the chat message below — rather than in the snapshot as well.
	r.send(player, Joined{
		Type:     "joined",
		PlayerId: id.String(),
		Code:     r.Code,
		Owner:    r.owner == id,
	})
	r.send(player, r.snapshot(player))
	r.send(player, CanvasMessage{Type: "canvas", Commands: r.canvasView()})

	r.post(ChatEntry{Kind: "join", Player: player.Username})
	r.broadcastPlayers()
}

func (c leaveCommand) apply(r *Room) {
	player, ok := r.players[c.id]
	if !ok {
		return
	}

	delete(r.players, c.id)
	delete(r.drawn, c.id)
	r.order = slices.DeleteFunc(r.order, func(id uuid.UUID) bool { return id == c.id })
	player.close()
	r.population.Store(int64(len(r.players)))

	// run() is about to stop the room; there is nobody left to tell.
	if len(r.players) == 0 {
		return
	}

	if r.owner == c.id {
		r.promoteOwner()
	}

	r.post(ChatEntry{Kind: "leave", Player: player.Username})
	r.broadcastPlayers()

	now := time.Now()
	if len(r.players) < MinPlayers {
		r.idle()
		return
	}
	switch {
	// Nobody is left to make the pick, so the pen moves on rather than the room
	// sitting out a countdown for a player who has gone.
	case r.phase == phaseChoosing && r.drawer == c.id:
		r.nextTurn(now)
	// The drawer walking out ends the turn: nobody left can finish it.
	case r.phase == phaseDrawing && (r.drawer == c.id || r.everyoneGuessed()):
		r.endTurn(now)
	}
}

func (c frameCommand) apply(r *Room) {
	player, ok := r.players[c.from]
	if !ok {
		return
	}

	var msg clientMessage
	if err := json.Unmarshal(c.data, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "start":
		r.start(player)
	case "settings":
		r.updateSettings(player, msg.Settings)
	case "guess":
		r.guess(player, msg.Text)
	case "pick":
		r.pick(player, msg.Choice)
	case "draw":
		r.draw(player, msg.Commands)
	}
}

// start is the host asking for a game, and the only way onto the board: a room
// no longer starts itself the moment it is big enough, which is what used to
// take a lobby into the guessing game while it was still being set up.
//
// Anyone but the host is ignored, and so is a start on a room already playing
// or too small to — same as `pick`, which is the other thing only one player at
// a time is allowed to ask for.
func (r *Room) start(player *Player) {
	if player.Id != r.owner || r.phase != phaseIdle || len(r.players) < MinPlayers {
		return
	}
	r.startGame(time.Now())
}

// updateSettings is the host turning one of the room's dials. Like `start`, it
// is ignored from anyone else — and while a game is running, when changing the
// number of rounds under a room halfway through one would be nobody's idea of a
// setting.
//
// What comes back out is the sanitized settings rather than the ones asked for,
// so every player — the host included — is looking at what the room will
// actually play by rather than at what was typed.
func (r *Room) updateSettings(player *Player, requested *Settings) {
	if requested == nil || player.Id != r.owner || r.phase != phaseIdle {
		return
	}

	r.settings = requested.sanitize(len(r.players))
	r.broadcast(SettingsMessage{Type: "settings", Settings: r.settings})
}

// promoteOwner hands the room to whoever has been here longest, so a live room
// always has an owner. The new owner is told, since the flag they were given on
// join is now out of date.
func (r *Room) promoteOwner() {
	var candidate *Player
	for _, player := range r.players {
		if candidate == nil || player.JoinedAt.Before(candidate.JoinedAt) {
			candidate = player
		}
	}
	if candidate == nil || candidate.Id == r.owner {
		return
	}

	r.owner = candidate.Id
	r.send(candidate, Joined{
		Type:     "joined",
		PlayerId: candidate.Id.String(),
		Code:     r.Code,
		Owner:    true,
	})
}

/* --------------------------------------------------------- the way out */

func (r *Room) send(p *Player, v any) {
	if data, err := json.Marshal(v); err == nil {
		p.push(data)
	}
}

func (r *Room) broadcast(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	for _, p := range r.players {
		p.push(data)
	}
}

func (r *Room) broadcastExcept(id uuid.UUID, v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	for _, p := range r.players {
		if p.Id != id {
			p.push(data)
		}
	}
}

func (r *Room) broadcastPlayers() {
	r.broadcast(PlayersMessage{Type: "players", Players: r.playerViews()})
}

// snapshot is the room as `viewer` is allowed to see it. Only the feed differs
// between players, and only ever by leaving lines out.
func (r *Room) snapshot(viewer *Player) Snapshot {
	snap := Snapshot{
		Type:     "room",
		Players:  r.playerViews(),
		Chat:     r.chatView(viewer.Id),
		Settings: r.settings,
	}
	if r.phase != phaseIdle {
		// Nobody has joined as the drawer, so this view never carries the word.
		turn := r.turnView(nil)
		snap.Turn = &turn
	}
	return snap
}

// The three views below always return a slice, never nil: the client parses
// these fields as arrays, and a `null` would fail the whole message.

func (r *Room) playerViews() []PlayerView {
	views := make([]PlayerView, 0, len(r.order))
	for _, id := range r.order {
		if p, ok := r.players[id]; ok {
			views = append(views, p.view(r.drawer, r.owner))
		}
	}
	return views
}

// chatView is the feed as one player is allowed to see it: the lines addressed
// to everyone, plus whichever side-channel lines they were an audience for.
func (r *Room) chatView(id uuid.UUID) []ChatEntry {
	view := make([]ChatEntry, 0, len(r.chat))
	for _, line := range r.chat {
		if line.visibleTo(id) {
			view = append(view, line.entry)
		}
	}
	return view
}

func (r *Room) canvasView() []DrawCommand {
	return append(make([]DrawCommand, 0, len(r.canvas)), r.canvas...)
}

// entry stamps a feed line with an id unique within the room, which is what the
// client keys its list on.
func (r *Room) entry(e ChatEntry) ChatEntry {
	r.chatSeq++
	e.Id = "c" + strconv.Itoa(r.chatSeq)
	return e
}

// chatLine is a kept feed entry and who it was written for.
//
// The audience is settled when the line is posted and never revisited, which is
// what makes the history safe to replay: a player who guesses halfway through a
// turn joins the side channel from there on, exactly as they would a room, and
// is not handed the part of the conversation that happened while they were
// still on the outside of it. Fixing it also means a reconnect shows a player
// the same feed they were reading before the socket dropped.
type chatLine struct {
	entry ChatEntry
	// audience is who may see the line, by player id. A nil audience is the
	// whole room, which is what most of the feed is.
	audience map[uuid.UUID]bool
}

func (l chatLine) visibleTo(id uuid.UUID) bool {
	return l.audience == nil || l.audience[id]
}

// post adds a line to the feed everyone can see. A `close` is not one of these:
// it goes to one player, and is never kept.
func (r *Room) post(e ChatEntry) {
	e = r.keep(chatLine{entry: r.entry(e)})
	r.broadcast(ChatMessage{Type: "chat", Entry: e})
}

// postTo adds a line only `audience` may see. It is kept like any other, so the
// side channel survives a reconnect for the players who were in it — and stays
// out of the history of the players who were not.
func (r *Room) postTo(e ChatEntry, scope string, audience map[uuid.UUID]bool) {
	e.Scope = scope
	e = r.keep(chatLine{entry: r.entry(e), audience: audience})

	message := ChatMessage{Type: "chat", Entry: e}
	for id := range audience {
		if p, ok := r.players[id]; ok {
			r.send(p, message)
		}
	}
}

// keep appends a line to the history and trims it, returning the entry to send.
func (r *Room) keep(line chatLine) ChatEntry {
	r.chat = append(r.chat, line)
	if len(r.chat) > maxChatHistory {
		r.chat = r.chat[len(r.chat)-maxChatHistory:]
	}
	return line.entry
}
