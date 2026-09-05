package game

import (
	"encoding/json"
	"testing"
)

// wireCases is one of every message the server can send, with the exact JSON
// the frontend's schemas parse. It is a golden test on purpose: the shapes here
// were checked against `src/lib/room/protocol.ts` by running both halves
// together, and this is what keeps a Go-side edit from quietly drifting away
// from them.
func wireCases() []struct {
	name string
	msg  any
	want string
} {
	gained := 180
	word := "sailboat"
	settings := DefaultSettings()
	custom := Settings{
		Rounds: 5, DrawSeconds: 40, MaxPlayers: 8, Hints: 0,
		WordSource: WordsCustom, Words: []string{"bagel", "kazoo", "tugboat"},
	}
	turn := TurnView{
		Round: 2, TotalRounds: 3, Phase: "drawing", DrawerId: "p2",
		Word: nil, Hint: "s___b__t", Seconds: 80, EndsIn: 42,
	}
	revealed := turn
	revealed.Phase = "reveal"
	revealed.Word = &word
	revealed.Seconds = RevealSeconds
	revealed.EndsIn = 0

	// The drawer's copy while they pick: no word and no hint yet, and the three
	// on offer instead. Nobody else's carries `choices` at all.
	choosing := TurnView{
		Round: 2, TotalRounds: 3, Phase: "choosing", DrawerId: "p2",
		Word: nil, Hint: "", Choices: []string{"sailboat", "igloo", "narwhal"},
		Seconds: ChooseSeconds, EndsIn: 12,
	}

	return []struct {
		name string
		msg  any
		want string
	}{
		{"joined", Joined{Type: "joined", PlayerId: "9ce95b20-450f-4898-928a-c5f77fefba02", Code: "ABC12", Owner: true}, "{\"type\":\"joined\",\"playerId\":\"9ce95b20-450f-4898-928a-c5f77fefba02\",\"code\":\"ABC12\",\"owner\":true}"},
		{"room/empty", Snapshot{Type: "room", Players: []PlayerView{}, Chat: []ChatEntry{}, Turn: nil, Settings: settings}, "{\"type\":\"room\",\"players\":[],\"chat\":[],\"turn\":null,\"settings\":{\"rounds\":3,\"drawSeconds\":80,\"maxPlayers\":12,\"hints\":2,\"wordSource\":\"default\",\"words\":[]}}"},
		{"room/full", Snapshot{
			Type:     "room",
			Players:  []PlayerView{{Id: "p1", Name: "alice", Score: 300, Gained: &gained, Status: "guessed"}},
			Chat:     []ChatEntry{{Kind: "join", Id: "c1", Player: "alice"}},
			Turn:     &turn,
			Settings: settings,
		}, "{\"type\":\"room\",\"players\":[{\"id\":\"p1\",\"name\":\"alice\",\"score\":300,\"gained\":180,\"status\":\"guessed\"}],\"chat\":[{\"kind\":\"join\",\"id\":\"c1\",\"player\":\"alice\"}],\"turn\":{\"round\":2,\"totalRounds\":3,\"phase\":\"drawing\",\"drawerId\":\"p2\",\"word\":null,\"hint\":\"s___b__t\",\"seconds\":80,\"endsIn\":42},\"settings\":{\"rounds\":3,\"drawSeconds\":80,\"maxPlayers\":12,\"hints\":2,\"wordSource\":\"default\",\"words\":[]}}"},
		{"players", PlayersMessage{Type: "players", Players: []PlayerView{{Id: "p1", Name: "alice", Status: "drawing"}}}, "{\"type\":\"players\",\"players\":[{\"id\":\"p1\",\"name\":\"alice\",\"score\":0,\"gained\":null,\"status\":\"drawing\"}]}"},
		{"chat/guess", ChatMessage{Type: "chat", Entry: ChatEntry{Kind: "guess", Id: "c2", PlayerId: "p1", Player: "alice", Text: "a boat?"}}, "{\"type\":\"chat\",\"entry\":{\"kind\":\"guess\",\"id\":\"c2\",\"playerId\":\"p1\",\"player\":\"alice\",\"text\":\"a boat?\"}}"},
		{"chat/correct", ChatMessage{Type: "chat", Entry: ChatEntry{Kind: "correct", Id: "c3", PlayerId: "p1", Player: "alice"}}, "{\"type\":\"chat\",\"entry\":{\"kind\":\"correct\",\"id\":\"c3\",\"playerId\":\"p1\",\"player\":\"alice\"}}"},
		{"chat/close", ChatMessage{Type: "chat", Entry: ChatEntry{Kind: "close", Id: "c4", Text: "sailbot"}}, "{\"type\":\"chat\",\"entry\":{\"kind\":\"close\",\"id\":\"c4\",\"text\":\"sailbot\"}}"},
		{"chat/leave", ChatMessage{Type: "chat", Entry: ChatEntry{Kind: "leave", Id: "c5", Player: "bob"}}, "{\"type\":\"chat\",\"entry\":{\"kind\":\"leave\",\"id\":\"c5\",\"player\":\"bob\"}}"},
		{"turn", TurnMessage{Type: "turn", Turn: turn}, "{\"type\":\"turn\",\"turn\":{\"round\":2,\"totalRounds\":3,\"phase\":\"drawing\",\"drawerId\":\"p2\",\"word\":null,\"hint\":\"s___b__t\",\"seconds\":80,\"endsIn\":42}}"},
		{"turn/revealed", TurnMessage{Type: "turn", Turn: revealed}, "{\"type\":\"turn\",\"turn\":{\"round\":2,\"totalRounds\":3,\"phase\":\"reveal\",\"drawerId\":\"p2\",\"word\":\"sailboat\",\"hint\":\"s___b__t\",\"seconds\":5,\"endsIn\":0}}"},
		{"turn/choosing", TurnMessage{Type: "turn", Turn: choosing}, "{\"type\":\"turn\",\"turn\":{\"round\":2,\"totalRounds\":3,\"phase\":\"choosing\",\"drawerId\":\"p2\",\"word\":null,\"hint\":\"\",\"choices\":[\"sailboat\",\"igloo\",\"narwhal\"],\"seconds\":15,\"endsIn\":12}}"},
		{"settings", SettingsMessage{Type: "settings", Settings: custom}, "{\"type\":\"settings\",\"settings\":{\"rounds\":5,\"drawSeconds\":40,\"maxPlayers\":8,\"hints\":0,\"wordSource\":\"custom\",\"words\":[\"bagel\",\"kazoo\",\"tugboat\"]}}"},
		{"hint", HintMessage{Type: "hint", Hint: "sa__b__t"}, "{\"type\":\"hint\",\"hint\":\"sa__b__t\"}"},
		{"idle", IdleMessage{Type: "idle"}, "{\"type\":\"idle\"}"},
		{"draw", DrawMessage{Type: "draw", Commands: []DrawCommand{
			{Kind: "stroke", Id: "s1", Color: "#1d1d1f", Size: 8, Points: []Point{{X: 1, Y: 2}, {X: 3, Y: 4}}},
			{Kind: "fill", Color: "#ff0000", At: &Point{X: 5, Y: 6}},
			{Kind: "clear"},
		}}, "{\"type\":\"draw\",\"commands\":[{\"kind\":\"stroke\",\"id\":\"s1\",\"color\":\"#1d1d1f\",\"size\":8,\"points\":[{\"x\":1,\"y\":2},{\"x\":3,\"y\":4}]},{\"kind\":\"fill\",\"color\":\"#ff0000\",\"at\":{\"x\":5,\"y\":6}},{\"kind\":\"clear\"}]}"},
		{"canvas/empty", CanvasMessage{Type: "canvas", Commands: []DrawCommand{}}, "{\"type\":\"canvas\",\"commands\":[]}"},
		{"error", ErrorMessage{Type: "error", Message: "something went wrong"}, "{\"type\":\"error\",\"message\":\"something went wrong\"}"},
	}
}
func TestEveryMessageMarshalsAsTheClientExpects(t *testing.T) {
	for _, c := range wireCases() {
		t.Run(c.name, func(t *testing.T) {
			got, err := json.Marshal(c.msg)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != c.want {
				t.Errorf("\n got: %s\nwant: %s", got, c.want)
			}
		})
	}
}

// The client parses these fields as arrays. A nil slice marshals to null, which
// fails the schema and takes the whole message down with it — so the room always
// hands over a slice, and this is the reminder of why.
func TestEmptyListsAreArraysNotNull(t *testing.T) {
	room := newRoom(t)
	player := join(t, room, "alice")

	snapshot := recv(t, player, "room")
	for _, field := range []string{"players", "chat"} {
		if _, ok := snapshot[field].([]any); !ok {
			t.Errorf("room.%s = %v, want an array", field, snapshot[field])
		}
	}
	if _, ok := recv(t, player, "canvas")["commands"].([]any); !ok {
		t.Error("canvas.commands is not an array")
	}

	settings, ok := snapshot["settings"].(map[string]any)
	if !ok {
		t.Fatalf("room.settings = %v, want an object", snapshot["settings"])
	}
	if _, ok := settings["words"].([]any); !ok {
		t.Errorf("room.settings.words = %v, want an array", settings["words"])
	}
}
