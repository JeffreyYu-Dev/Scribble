package game

import (
	"encoding/json"
	"testing"
	"time"
	"uuid"
)

func newRoom(t *testing.T) *Room {
	t.Helper()
	room, err := CreateRoom()
	if err != nil {
		t.Fatal(err)
	}
	room.Start(func() {})
	t.Cleanup(room.Shutdown)
	return room
}

func join(t *testing.T, room *Room, username string) *Player {
	t.Helper()
	player, _, err := room.Join(username, uuid.Nil())
	if err != nil {
		t.Fatalf("join %s: %v", username, err)
	}
	return player
}

// recv reads frames until one of the wanted type turns up.
func recv(t *testing.T, p *Player, kind string) map[string]any {
	t.Helper()
	timeout := time.After(2 * time.Second)
	for {
		select {
		case data, ok := <-p.frames:
			if !ok {
				t.Fatalf("%s: socket closed waiting for %q", p.Username, kind)
			}
			var msg map[string]any
			if err := json.Unmarshal(data, &msg); err != nil {
				t.Fatal(err)
			}
			if msg["type"] == kind {
				return msg
			}
		case <-timeout:
			t.Fatalf("%s: timed out waiting for %q", p.Username, kind)
		}
	}
}

// silent asserts nothing of the wanted type arrives. Everything a room does in
// response to a command is done before the next one is applied, so a round trip
// through the inbox is enough of a wait.
func silent(t *testing.T, room *Room, p *Player, kind string) {
	t.Helper()
	room.inspect(func(*Room) {})
	for {
		select {
		case data, ok := <-p.frames:
			if !ok {
				return
			}
			var msg map[string]any
			if err := json.Unmarshal(data, &msg); err != nil {
				t.Fatal(err)
			}
			if msg["type"] == kind {
				t.Fatalf("%s: got an unexpected %q: %s", p.Username, kind, data)
			}
		default:
			return
		}
	}
}

// recvTurn reads turn frames until one for the wanted phase turns up. A turn
// now arrives twice — once for the pick, once for the drawing — so a test that
// wants one of them has to say which.
func recvTurn(t *testing.T, p *Player, phase string) map[string]any {
	t.Helper()
	for {
		view := recv(t, p, "turn")["turn"].(map[string]any)
		if view["phase"] == phase {
			return view
		}
	}
}

func guess(room *Room, p *Player, text string) {
	body, _ := json.Marshal(clientMessage{Type: "guess", Text: text})
	room.Receive(p, body)
}

func start(room *Room, p *Player) {
	body, _ := json.Marshal(clientMessage{Type: "start"})
	room.Receive(p, body)
}

// turn forces a game to start and reports who is drawing and what the word is,
// so a test does not have to sit through the lobby countdown — or the drawer's
// pick, which is taken for them here.
func turn(t *testing.T, room *Room) (drawer uuid.UUID, word string) {
	t.Helper()
	room.inspect(func(r *Room) {
		now := time.Now()
		r.startGame(now)
		r.chooseWord(now, 0)
		drawer, word = r.drawer, r.word
	})
	if word == "" {
		t.Fatal("no turn started")
	}
	return drawer, word
}

func TestJoinIsAcknowledgedWithASnapshot(t *testing.T) {
	room := newRoom(t)
	player := join(t, room, "alice")

	ack := recv(t, player, "joined")
	if ack["playerId"] != player.Id.String() || ack["code"] != room.Code {
		t.Fatalf("bad ack: %v", ack)
	}
	// Nobody reserved the room, so the first player in owns it.
	if ack["owner"] != true {
		t.Fatalf("first player did not get the room: %v", ack)
	}

	snapshot := recv(t, player, "room")
	players, ok := snapshot["players"].([]any)
	if !ok || len(players) != 1 {
		t.Fatalf("snapshot roster: %v", snapshot["players"])
	}
	// The client parses these as arrays; a nil slice would arrive as null and
	// fail the whole message.
	if _, ok := snapshot["chat"].([]any); !ok {
		t.Fatalf("chat is not an array: %v", snapshot["chat"])
	}
	if snapshot["turn"] != nil {
		t.Fatalf("a room with one player has no turn: %v", snapshot["turn"])
	}

	if commands, ok := recv(t, player, "canvas")["commands"].([]any); !ok || len(commands) != 0 {
		t.Fatal("a fresh room should hand over a blank board")
	}
}

func TestReservedOwnerIsClaimedByItsId(t *testing.T) {
	room := newRoom(t)
	reserved := uuid.New()
	room.SetOwner(reserved)

	// Somebody has to own an occupied room, so the first to arrive holds it.
	other := join(t, room, "bob")
	if recv(t, other, "joined")["owner"] != true {
		t.Fatal("an occupied room was left without an owner")
	}

	// The creator still gets it when they turn up, and bob is told he no
	// longer has it.
	creator, owner, err := room.Join("alice", reserved)
	if err != nil {
		t.Fatal(err)
	}
	if !owner || creator.Id != reserved {
		t.Fatalf("creator did not claim the room: owner=%v id=%v", owner, creator.Id)
	}

	// A claim is spent once: a second socket waving the same id is an ordinary
	// player, not a second seat for the creator.
	twin, owner, err := room.Join("alice", reserved)
	if err != nil {
		t.Fatal(err)
	}
	if owner || twin.Id == creator.Id {
		t.Fatalf("the reservation was honoured twice: owner=%v id=%v", owner, twin.Id)
	}
}

func TestAPromotedOwnerIsToldTheyOwnIt(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	if recv(t, bob, "joined")["owner"] != false {
		t.Fatal("bob owned a room alice was already in")
	}
	drain(bob)
	room.Leave(alice)

	if recv(t, bob, "joined")["owner"] != true {
		t.Fatal("bob was not told the room had become his")
	}
}

func TestOwnershipPassesOnWhenTheOwnerLeaves(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	room.Leave(alice)

	var owner uuid.UUID
	room.inspect(func(r *Room) { owner = r.owner })
	if owner != bob.Id {
		t.Fatal("the room was left without an owner")
	}
}

func TestTheWordReachesTheDrawerAndNobodyElse(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drawer, word := turn(t, room)

	drawing, guessing := alice, bob
	if drawer == bob.Id {
		drawing, guessing = bob, alice
	}

	if got := recvTurn(t, drawing, "drawing")["word"]; got != word {
		t.Fatalf("the drawer was not given the word: %v", got)
	}

	theirs := recvTurn(t, guessing, "drawing")
	if theirs["word"] != nil {
		t.Fatalf("a guesser was handed the word: %v", theirs["word"])
	}
	hint, _ := theirs["hint"].(string)
	if len([]rune(hint)) != len([]rune(word)) {
		t.Fatalf("hint %q does not fit %q", hint, word)
	}
	for i, char := range []rune(hint) {
		if char != Hidden && char != ' ' {
			t.Fatalf("hint %q gives away position %d before the turn starts", hint, i)
		}
	}
}

func TestACorrectGuessScoresAndEndsTheTurn(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drawer, word := turn(t, room)
	guesser := alice
	if drawer == alice.Id {
		guesser = bob
	}

	drain(guesser)
	guess(room, guesser, word)

	entry := recv(t, guesser, "chat")["entry"].(map[string]any)
	if entry["kind"] != "correct" {
		t.Fatalf("guess was not accepted: %v", entry)
	}
	// The word itself must not travel with it.
	if _, leaked := entry["text"]; leaked {
		t.Fatalf("a correct guess carried the word into the transcript: %v", entry)
	}

	var phase phase
	var score int
	var gained *int
	room.inspect(func(r *Room) {
		phase = r.phase
		score = r.players[guesser.Id].Score
		gained = r.players[guesser.Id].Gained
	})
	if score <= 0 || gained == nil || *gained != score {
		t.Fatalf("guess not scored: score=%d gained=%v", score, gained)
	}
	// Everyone but the drawer has it, so there is nothing left to guess.
	if phase != phaseReveal {
		t.Fatal("the turn did not end once the last guesser got it")
	}
}

func TestANearMissIsToldOnlyToWhoeverTypedIt(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drawer, word := turn(t, room)
	guesser, other := alice, bob
	if drawer == alice.Id {
		guesser, other = bob, alice
	}

	// One letter off the word, and long enough to be worth a nudge.
	typo := []rune(word)
	typo[0] = 'z'
	if word[0] == 'z' {
		typo[0] = 'q'
	}
	if len(typo) < 5 {
		t.Skipf("%q is too short for a near miss", word)
	}

	drain(other)
	drain(guesser)
	guess(room, guesser, string(typo))

	if entry := recv(t, guesser, "chat")["entry"].(map[string]any); entry["kind"] != "close" {
		t.Fatalf("near miss not reported: %v", entry)
	}
	silent(t, room, other, "chat")
}

// sideChannel starts a turn in a three-player room and gets one guesser onto
// the inside of it: the drawer and `knows` have the word, `guessing` does not.
func sideChannel(t *testing.T, room *Room) (drawing, knows, guessing *Player, word string) {
	t.Helper()

	drawing = join(t, room, "alice")
	knows = join(t, room, "bob")
	guessing = join(t, room, "carol")

	drawer, word := turn(t, room)
	// The pen goes round in join order, so it starts with the first to arrive.
	if drawer != drawing.Id {
		t.Fatalf("expected alice to be drawing, got %v", drawer)
	}

	drain(drawing)
	drain(knows)
	drain(guessing)

	guess(room, knows, word)
	// Their arrival on the inside is public: it is the turn's news.
	if entry := recv(t, guessing, "chat")["entry"].(map[string]any); entry["kind"] != "correct" {
		t.Fatalf("guess was not accepted: %v", entry)
	}

	drain(drawing)
	drain(knows)
	drain(guessing)
	return drawing, knows, guessing, word
}

func TestWhoeverHasTheWordTalksOnlyToTheOthersWhoHaveIt(t *testing.T) {
	room := newRoom(t)
	drawing, knows, guessing, word := sideChannel(t, room)

	// From both seats on the inside, including the drawer's — and the word
	// itself is fair game there, since everyone reading it already has it.
	for _, speaker := range []*Player{drawing, knows} {
		text := "it is a " + word
		guess(room, speaker, text)

		for _, listener := range []*Player{drawing, knows} {
			entry := recv(t, listener, "chat")["entry"].(map[string]any)
			if entry["text"] != text {
				t.Fatalf("%s did not hear %s: %v", listener.Username, speaker.Username, entry)
			}
			// Marked, so the client can say who can read it.
			if entry["scope"] != ScopeGuessed {
				t.Fatalf("side channel line was not scoped: %v", entry)
			}
		}
		silent(t, room, guessing, "chat")
	}
}

func TestAGuesserOnTheOutsideIsStillHeardByEveryone(t *testing.T) {
	room := newRoom(t)
	drawing, knows, guessing, _ := sideChannel(t, room)

	guess(room, guessing, "a canoe?")
	for _, listener := range []*Player{drawing, knows} {
		entry := recv(t, listener, "chat")["entry"].(map[string]any)
		if entry["text"] != "a canoe?" {
			t.Fatalf("%s did not hear the guess: %v", listener.Username, entry)
		}
		if _, scoped := entry["scope"]; scoped {
			t.Fatalf("an ordinary guess was scoped: %v", entry)
		}
	}
}

func TestTheSideChannelStaysOutOfTheHistoryOfWhoeverWasNotInIt(t *testing.T) {
	room := newRoom(t)
	_, knows, _, _ := sideChannel(t, room)

	guess(room, knows, "nailed it")
	recv(t, knows, "chat")

	// A player arriving mid-turn is on the outside of it, so the snapshot they
	// are dealt has to be too — the history is where a scoped line would
	// otherwise leak once the socket is no longer choosing who to send it to.
	dave := join(t, room, "dave")
	for _, line := range recv(t, dave, "room")["chat"].([]any) {
		entry := line.(map[string]any)
		if entry["text"] == "nailed it" {
			t.Fatalf("the side channel turned up in a newcomer's history: %v", entry)
		}
	}

	// And it is still there for the player who was in it.
	frank := join(t, room, "frank")
	drain(frank)
	room.inspect(func(r *Room) {
		seen := false
		for _, entry := range r.chatView(knows.Id) {
			seen = seen || entry.Text == "nailed it"
		}
		if !seen {
			t.Error("the side channel went missing from its own author's history")
		}
		if len(r.chatView(frank.Id)) >= len(r.chatView(knows.Id)) {
			t.Error("a newcomer was dealt as much history as an insider")
		}
	})
}

func TestStrokesGoToEveryoneButTheDrawer(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drawer, _ := turn(t, room)
	drawing, watching := alice, bob
	if drawer == bob.Id {
		drawing, watching = bob, alice
	}

	stroke := DrawCommand{
		Kind:   "stroke",
		Id:     "s1",
		Color:  "#000000",
		Size:   8,
		Points: []Point{{X: 1, Y: 2}, {X: 3, Y: 4}},
	}
	body, _ := json.Marshal(clientMessage{Type: "draw", Commands: []DrawCommand{stroke}})

	drain(drawing)
	drain(watching)
	room.Receive(drawing, body)

	if commands := recv(t, watching, "draw")["commands"].([]any); len(commands) != 1 {
		t.Fatalf("stroke not relayed: %v", commands)
	}
	silent(t, room, drawing, "draw")

	// Someone who does not hold the pen cannot draw on the board.
	room.Receive(watching, body)
	silent(t, room, drawing, "draw")

	// And the board is kept, so a player arriving mid-turn is caught up.
	late := join(t, room, "carol")
	if commands := recv(t, late, "canvas")["commands"].([]any); len(commands) != 1 {
		t.Fatalf("late joiner got %v, want the stroke so far", commands)
	}
}

func TestMalformedFramesAreIgnored(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drawer, _ := turn(t, room)
	drawing := alice
	if drawer == bob.Id {
		drawing = bob
	}

	drain(alice)
	drain(bob)

	room.Receive(drawing, []byte("not json"))
	room.Receive(drawing, []byte(`{"type":"nonsense"}`))
	// A stroke with no points and a fill with nowhere to go are both undrawable.
	body, _ := json.Marshal(clientMessage{Type: "draw", Commands: []DrawCommand{
		{Kind: "stroke", Id: "s1", Color: "#000000", Size: 8},
		{Kind: "fill", Color: "#000000"},
	}})
	room.Receive(drawing, body)

	silent(t, room, bob, "draw")

	// The room is still running and still playing.
	var running bool
	room.inspect(func(r *Room) { running = r.phase == phaseDrawing })
	if !running {
		t.Fatal("a bad frame took the turn down")
	}
}

func TestTheRoomStopsWhenItEmpties(t *testing.T) {
	stopped := make(chan struct{})
	room, err := CreateRoom()
	if err != nil {
		t.Fatal(err)
	}
	room.Start(func() { close(stopped) })

	alice := join(t, room, "alice")
	if room.Population() != 1 {
		t.Fatalf("population %d, want 1", room.Population())
	}
	room.Leave(alice)

	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("the room outlived its last player")
	}

	if _, _, err := room.Join("bob", uuid.Nil()); err != ErrRoomClosed {
		t.Fatalf("joining a stopped room: %v, want %v", err, ErrRoomClosed)
	}
}

func TestAnEmptyLobbyWaitsToBeJoined(t *testing.T) {
	stopped := make(chan struct{})
	room, err := CreateRoom()
	if err != nil {
		t.Fatal(err)
	}
	room.Start(func() { close(stopped) })
	t.Cleanup(room.Shutdown)

	select {
	case <-stopped:
		t.Fatal("a lobby stopped before its creator could connect")
	case <-time.After(2 * tick):
	}
}

func drain(p *Player) {
	for {
		select {
		case _, ok := <-p.frames:
			if !ok {
				return
			}
		default:
			return
		}
	}
}

func TestThePenGoesRoundBeforeTheRoundTurnsOver(t *testing.T) {
	room := newRoom(t)
	join(t, room, "alice")
	join(t, room, "bob")
	turn(t, room)

	var seen []uuid.UUID
	var rounds []int
	for range 3 {
		room.inspect(func(r *Room) {
			seen = append(seen, r.drawer)
			rounds = append(rounds, r.round)
			r.endTurn(time.Now())
			r.nextTurn(time.Now())
		})
	}

	if seen[0] == seen[1] {
		t.Fatalf("the same player drew twice in round 1: %v", seen)
	}
	if rounds[0] != 1 || rounds[1] != 1 {
		t.Fatalf("the round turned over early: %v", rounds)
	}
	// Both have drawn, so the third turn belongs to the next round.
	if rounds[2] != 2 {
		t.Fatalf("round did not advance once everyone had drawn: %v", rounds)
	}
	if seen[2] != seen[0] {
		t.Fatal("the new round did not start back at the top of the room")
	}
}

func TestTheGameEndsAfterTheLastRound(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")
	turn(t, room)

	drain(alice)
	drain(bob)
	room.inspect(func(r *Room) {
		// Stand at the end of the last round, with something on the scoreboard.
		r.round = TotalRounds
		for id := range r.players {
			r.drawn[id] = true
			r.players[id].Score = 500
		}
		r.endTurn(time.Now())
		r.nextTurn(time.Now())
	})

	recv(t, alice, "idle")

	scores := recv(t, alice, "players")["players"].([]any)
	for _, entry := range scores {
		if entry.(map[string]any)["score"].(float64) != 500 {
			t.Fatalf("the final scoreboard was cleared too early: %v", entry)
		}
	}

	var waiting bool
	room.inspect(func(r *Room) { waiting = r.phase == phaseIdle && r.word == "" })
	if !waiting {
		t.Fatal("the room did not go idle after the last round")
	}

	// The next game starts from zero.
	room.inspect(func(r *Room) { r.startGame(time.Now()) })
	var score int
	room.inspect(func(r *Room) { score = r.players[alice.Id].Score })
	if score != 0 {
		t.Fatalf("a new game began on the old scores: %d", score)
	}
}

func TestAGameStopsWhenItRunsOutOfPlayers(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")
	turn(t, room)

	drain(bob)
	room.Leave(alice)
	recv(t, bob, "idle")

	var phase phase
	room.inspect(func(r *Room) { phase = r.phase })
	if phase != phaseIdle {
		t.Fatal("a game carried on with one player in it")
	}
}

func TestHintsAreGivenAwayAsTheClockRunsDown(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")
	_, word := turn(t, room)

	drain(alice)
	drain(bob)

	// Walk the clock to the end of the turn without waiting for it.
	var hints int
	room.inspect(func(r *Room) {
		hints = len(r.hintsAt)
		r.giveHints(time.Now().Add(TurnSeconds * time.Second))
	})
	if hints == 0 {
		t.Fatalf("no hints scheduled for %q", word)
	}

	var hint string
	for range hints {
		hint = recv(t, bob, "hint")["hint"].(string)
	}

	given := 0
	for i, char := range []rune(hint) {
		// Spaces were never hidden, so they are not a letter given away.
		if char == Hidden || char == ' ' {
			continue
		}
		given++
		if char != []rune(word)[i] {
			t.Fatalf("hint %q does not follow %q", hint, word)
		}
	}
	if given != hints {
		t.Fatalf("hint %q gave away %d letters, want %d", hint, given, hints)
	}
	if hint == word {
		t.Fatalf("the hints handed over the whole word: %q", hint)
	}
}

func TestTheDrawerPicksTheWordAndNobodyElseSeesTheChoices(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	// Started rather than forced through to the drawing: the pick is what is
	// under test, so the room is left sitting on it.
	var drawer uuid.UUID
	room.inspect(func(r *Room) {
		r.startGame(time.Now())
		drawer = r.drawer
	})

	drawing, guessing := alice, bob
	if drawer == bob.Id {
		drawing, guessing = bob, alice
	}

	offered := recvTurn(t, drawing, "choosing")
	choices, ok := offered["choices"].([]any)
	if !ok || len(choices) != WordChoices {
		t.Fatalf("the drawer was not dealt %d words: %v", WordChoices, offered["choices"])
	}
	if offered["word"] != nil {
		t.Fatalf("a word was settled before anyone picked one: %v", offered["word"])
	}

	// Three words, one of which is the answer: a guesser may see none of them.
	theirs := recvTurn(t, guessing, "choosing")
	if _, offered := theirs["choices"]; offered {
		t.Fatalf("a guesser was handed the choices: %v", theirs["choices"])
	}
	if theirs["hint"] != "" {
		t.Fatalf("a hint arrived before there was a word: %v", theirs["hint"])
	}

	// A guesser cannot pick, and the room is still waiting afterwards.
	body, _ := json.Marshal(clientMessage{Type: "pick", Choice: 1})
	room.Receive(guessing, body)
	var phase phase
	room.inspect(func(r *Room) { phase = r.phase })
	if phase != phaseChoosing {
		t.Fatal("a guesser picked the drawer's word")
	}

	room.Receive(drawing, body)

	var word string
	room.inspect(func(r *Room) { phase, word = r.phase, r.word })
	if phase != phaseDrawing {
		t.Fatal("the turn did not start once the drawer picked")
	}
	if want := choices[1].(string); word != want {
		t.Fatalf("the turn started on %q, not the %q that was picked", word, want)
	}
	// Spent: the offer is over, and nothing may hand it out again.
	room.inspect(func(r *Room) {
		if r.choices != nil {
			t.Errorf("the choices outlived the pick: %v", r.choices)
		}
	})

	if got := recvTurn(t, drawing, "drawing")["word"]; got != word {
		t.Fatalf("the drawer was not given the word they picked: %v", got)
	}
}

func TestTheClockPicksForADrawerWhoDoesNot(t *testing.T) {
	room := newRoom(t)
	join(t, room, "alice")
	join(t, room, "bob")

	var word string
	room.inspect(func(r *Room) {
		now := time.Now()
		r.startGame(now)
		// The pick ran out a moment ago, which is the only thing `advance` is
		// waiting on here.
		r.deadline = now.Add(-time.Second)
		r.advance(now)
		word = r.word
	})

	if word == "" {
		t.Fatal("the turn never started on a drawer who said nothing")
	}
}

func TestARoomWaitsToBeStarted(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	// Enough players to play, and a clock that has run well past anything the
	// room used to count down. It still has not been asked for a game.
	room.inspect(func(r *Room) { r.advance(time.Now().Add(time.Hour)) })

	silent(t, room, alice, "turn")
	silent(t, room, bob, "turn")

	var phase phase
	room.inspect(func(r *Room) { phase = r.phase })
	if phase != phaseIdle {
		t.Fatal("the room started a game nobody asked for")
	}
}

func TestOnlyTheHostStartsTheGame(t *testing.T) {
	room := newRoom(t)
	// alice is first in, so the room is hers.
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	start(room, bob)
	silent(t, room, alice, "turn")

	var phase phase
	room.inspect(func(r *Room) { phase = r.phase })
	if phase != phaseIdle {
		t.Fatal("a player who does not hold the room started a game in it")
	}

	start(room, alice)
	recvTurn(t, bob, "choosing")

	room.inspect(func(r *Room) { phase = r.phase })
	if phase != phaseChoosing {
		t.Fatalf("the host's start did not begin a turn: phase %v", phase)
	}
}

func TestAStartNeedsASecondPlayer(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")

	start(room, alice)
	silent(t, room, alice, "turn")

	var phase phase
	room.inspect(func(r *Room) { phase = r.phase })
	if phase != phaseIdle {
		t.Fatal("a game began with nobody to guess")
	}
}
