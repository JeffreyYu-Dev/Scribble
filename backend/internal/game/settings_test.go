package game

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"
	"uuid"
)

// configure sends a settings message as `p` would.
func configure(room *Room, p *Player, s Settings) {
	body, _ := json.Marshal(clientMessage{Type: "settings", Settings: &s})
	room.Receive(p, body)
}

// settingsOf reads the room's settings straight off its goroutine.
func settingsOf(room *Room) Settings {
	var s Settings
	room.inspect(func(r *Room) { s = r.settings })
	return s
}

func TestTheHostsSettingsReachEveryone(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drain(alice)
	drain(bob)
	configure(room, alice, Settings{
		Rounds: 5, DrawSeconds: 40, MaxPlayers: 8, Hints: 0,
		WordSource: WordsCustom, Words: []string{"bagel", "kazoo", "tugboat"},
	})

	// The player who is not the host is shown the dials too: the room is about
	// to be played this way, and only turning them is the host's alone.
	for _, p := range []*Player{alice, bob} {
		got := recv(t, p, "settings")["settings"].(map[string]any)
		if got["rounds"].(float64) != 5 || got["drawSeconds"].(float64) != 40 {
			t.Fatalf("%s was sent %v", p.Username, got)
		}
	}

	if got := settingsOf(room); got.Rounds != 5 || got.Hints != 0 || got.WordSource != WordsCustom {
		t.Fatalf("the room kept %+v", got)
	}
}

func TestOnlyTheHostMayChangeTheSettings(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	bob := join(t, room, "bob")

	drain(alice)
	drain(bob)
	configure(room, bob, Settings{Rounds: 5, DrawSeconds: 40, MaxPlayers: 8})

	silent(t, room, alice, "settings")
	if got := settingsOf(room); got.Rounds != TotalRounds {
		t.Fatalf("a guest changed the room to %+v", got)
	}
}

func TestSettingsAreLeftAloneOnceAGameIsRunning(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	join(t, room, "bob")
	turn(t, room)

	drain(alice)
	configure(room, alice, Settings{Rounds: 5, DrawSeconds: 40, MaxPlayers: 8})

	silent(t, room, alice, "settings")
	if got := settingsOf(room); got.Rounds != TotalRounds {
		t.Fatalf("the rounds moved under a running game: %+v", got)
	}
}

func TestNonsenseSettingsAreClampedRatherThanRefused(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")

	drain(alice)
	configure(room, alice, Settings{
		Rounds: 999, DrawSeconds: 1, MaxPlayers: 0, Hints: -4, WordSource: "shrubbery",
	})

	got := settingsOf(room)
	if got.Rounds != maxRounds || got.DrawSeconds != minDrawSeconds {
		t.Fatalf("rounds and draw time were not clamped: %+v", got)
	}
	if got.MaxPlayers != MinPlayers || got.Hints != 0 {
		t.Fatalf("players and hints were not clamped: %+v", got)
	}
	if got.WordSource != WordsDefault {
		t.Fatalf("an unknown word source survived: %q", got.WordSource)
	}
	// Never nil: the client parses this as an array.
	if got.Words == nil {
		t.Fatal("the word bank came back as null")
	}
}

// Shrinking the room below the people in it would mean throwing somebody out,
// which no setting should be able to do.
func TestTheRoomWillNotHoldFewerSeatsThanItHasPlayers(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	join(t, room, "bob")
	join(t, room, "carol")

	drain(alice)
	configure(room, alice, Settings{Rounds: 3, DrawSeconds: 80, MaxPlayers: 2})

	if got := settingsOf(room); got.MaxPlayers != 3 {
		t.Fatalf("maxPlayers = %d, want the 3 players already seated", got.MaxPlayers)
	}
}

func TestAFullRoomTurnsPlayersAway(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")

	drain(alice)
	configure(room, alice, Settings{Rounds: 3, DrawSeconds: 80, MaxPlayers: 2})
	join(t, room, "bob")

	if _, _, err := room.Join("carol", uuid.Nil()); err != ErrRoomFull {
		t.Fatalf("joining a full room: %v, want %v", err, ErrRoomFull)
	}
}

// The creator's seat was reserved before anybody else took one, and a room its
// owner cannot get into has nobody left to raise the cap.
func TestTheCreatorIsSeatedInARoomThatIsAlreadyFull(t *testing.T) {
	room, err := CreateRoom()
	if err != nil {
		t.Fatal(err)
	}
	owner := uuid.New()
	room.SetOwner(owner)
	room.Start(func() {})
	t.Cleanup(room.Shutdown)

	first := join(t, room, "alice")
	drain(first)
	// Set by whoever is holding the room until the creator arrives.
	configure(room, first, Settings{Rounds: 3, DrawSeconds: 80, MaxPlayers: 2})
	join(t, room, "bob")

	player, hosting, err := room.Join("creator", owner)
	if err != nil {
		t.Fatalf("the creator was turned away: %v", err)
	}
	if !hosting || player.Id != owner {
		t.Fatalf("the creator arrived as %v (hosting %v)", player.Id, hosting)
	}
}

func TestTheRoundsAndTheClockFollowTheSettings(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")
	join(t, room, "bob")

	drain(alice)
	configure(room, alice, Settings{Rounds: 5, DrawSeconds: 40, MaxPlayers: 8, Hints: 1})
	turn(t, room)

	view := recvTurn(t, alice, "drawing")
	if view["totalRounds"].(float64) != 5 {
		t.Fatalf("the turn is one of %v rounds, want 5", view["totalRounds"])
	}
	if view["seconds"].(float64) != 40 {
		t.Fatalf("the turn runs for %v seconds, want 40", view["seconds"])
	}

	var scheduled int
	room.inspect(func(r *Room) { scheduled = len(r.hintsAt) })
	if scheduled != 1 {
		t.Fatalf("%d hints scheduled, want the 1 the room was set to", scheduled)
	}
}

func TestACustomBankIsWhatTheDrawerIsDealt(t *testing.T) {
	bank := []string{"bagel", "kazoo", "tugboat", "harmonica"}

	room := newRoom(t)
	alice := join(t, room, "alice")
	join(t, room, "bob")

	drain(alice)
	configure(room, alice, Settings{
		Rounds: 3, DrawSeconds: 80, MaxPlayers: 8,
		WordSource: WordsCustom, Words: bank,
	})

	var choices []string
	room.inspect(func(r *Room) {
		r.startGame(time.Now())
		choices = slices.Clone(r.choices)
	})

	if len(choices) != WordChoices {
		t.Fatalf("dealt %v", choices)
	}
	for _, word := range choices {
		if !slices.Contains(bank, word) {
			t.Fatalf("%q is not one of the room's own words: %v", word, choices)
		}
	}
}

// A bank too short to deal a whole choice from is the one case the room
// overrules its host: three words are dealt at once, and two would mean dealing
// the same one twice.
func TestATooShortCustomBankFallsBackToTheBuiltInList(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")

	drain(alice)
	configure(room, alice, Settings{
		Rounds: 3, DrawSeconds: 80, MaxPlayers: 8,
		WordSource: WordsCustom, Words: []string{"bagel", "kazoo"},
	})

	var pool []string
	room.inspect(func(r *Room) { pool = r.wordPool() })
	if len(pool) != len(words) {
		t.Fatalf("the pool holds %d words, want the built-in %d", len(pool), len(words))
	}
}

func TestAMixedBankKeepsBothLists(t *testing.T) {
	room := newRoom(t)
	alice := join(t, room, "alice")

	drain(alice)
	configure(room, alice, Settings{
		Rounds: 3, DrawSeconds: 80, MaxPlayers: 8,
		WordSource: WordsMixed, Words: []string{"bagel"},
	})

	var pool []string
	room.inspect(func(r *Room) { pool = r.wordPool() })
	if len(pool) != len(words)+1 || !slices.Contains(pool, "bagel") {
		t.Fatalf("a mixed pool of %d words did not keep both lists", len(pool))
	}
}

func TestTheWordBankIsCleanedBeforeItIsKept(t *testing.T) {
	long := "a word far longer than any room has any business dealing out"

	got := cleanWords([]string{
		"  spaced   out  ", "", "   ", "Bagel", "bagel", "BAGEL", long,
	})

	want := []string{"spaced out", "Bagel", strings.TrimSpace(long[:MaxWordLength])}
	if !slices.Equal(got, want) {
		t.Fatalf("cleanWords = %q, want %q", got, want)
	}
}

func TestTheWordBankIsCapped(t *testing.T) {
	raw := make([]string, MaxCustomWords+50)
	for i := range raw {
		raw[i] = "word" + string(rune('a'+i%26)) + string(rune('a'+i/26))
	}

	if got := len(cleanWords(raw)); got > MaxCustomWords {
		t.Fatalf("kept %d words, want at most %d", got, MaxCustomWords)
	}
}
