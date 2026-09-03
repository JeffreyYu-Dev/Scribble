package api

import (
	"encoding/json"
	"net/http/httptest"
	"scribble/backend/internal/game"
	"slices"
	"strings"
	"testing"
	"time"
	"uuid"
)

func createLobby(t *testing.T, ss *ScribbleServer) (*game.Room, uuid.UUID) {
	t.Helper()

	req := httptest.NewRequest("POST", "/lobby", strings.NewReader(`{"username":"jeff"}`))
	w := httptest.NewRecorder()
	ss.ServeHTTP(w, req)
	if w.Code != 201 {
		t.Fatalf("create: got %d, want 201", w.Code)
	}

	var res CreateLobbyResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Code) != game.CodeLength {
		t.Fatalf("code %q is not %d characters", res.Code, game.CodeLength)
	}

	room, ok := ss.roomByCode(res.Code)
	if !ok {
		t.Fatalf("room %q was not indexed by its code", res.Code)
	}
	return room, res.PlayerId
}

// eventually polls until cond holds, for the things a room's own goroutine does
// on its way out.
func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func (ss *ScribbleServer) roomCount() int {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return len(ss.Rooms)
}

func TestCreateLobbyRejectsANamelessPlayer(t *testing.T) {
	ss := NewScribbleServer()
	defer ss.Close()

	for _, body := range []string{`{"username":"  "}`, `{}`, `not json`} {
		req := httptest.NewRequest("POST", "/lobby", strings.NewReader(body))
		w := httptest.NewRecorder()
		ss.ServeHTTP(w, req)
		if w.Code != 400 {
			t.Errorf("%s: got %d, want 400", body, w.Code)
		}
	}
	if n := ss.roomCount(); n != 0 {
		t.Fatalf("a rejected request left %d room(s) behind", n)
	}
}

func TestSweepRemovesNeverJoined(t *testing.T) {
	ss := NewScribbleServer()
	defer ss.Close()
	createLobby(t, ss)

	if n := ss.Sweep(0); n != 1 {
		t.Fatalf("swept %d, want 1", n)
	}
	ss.mu.Lock()
	rooms, codes := len(ss.Rooms), len(ss.byCode)
	ss.mu.Unlock()
	if rooms != 0 || codes != 0 {
		t.Fatalf("indexes not cleared: Rooms=%d byCode=%d", rooms, codes)
	}
}

func TestSweepKeepsOccupied(t *testing.T) {
	ss := NewScribbleServer()
	defer ss.Close()
	room, _ := createLobby(t, ss)

	if _, _, err := room.Join("bob", uuid.Nil()); err != nil {
		t.Fatal(err)
	}

	if n := ss.Sweep(0); n != 0 {
		t.Fatal("swept an occupied room")
	}
	if ss.roomCount() != 1 {
		t.Fatal("the room went missing")
	}
}

func TestTheCreatorClaimsTheirLobby(t *testing.T) {
	ss := NewScribbleServer()
	defer ss.Close()
	room, ownerId := createLobby(t, ss)

	player, owner, err := room.Join("jeff", ownerId)
	if err != nil {
		t.Fatal(err)
	}
	if !owner || player.Id != ownerId {
		t.Fatalf("creator did not claim their lobby: owner=%v id=%v", owner, player.Id)
	}
}

func TestARoomDropsItselfOnceEmpty(t *testing.T) {
	ss := NewScribbleServer()
	defer ss.Close()
	room, _ := createLobby(t, ss)

	alice, _, err := room.Join("alice", uuid.Nil())
	if err != nil {
		t.Fatal(err)
	}
	bob, _, err := room.Join("bob", uuid.Nil())
	if err != nil {
		t.Fatal(err)
	}

	room.Leave(alice)
	if ss.roomCount() != 1 {
		t.Fatal("the room went while bob was still in it")
	}

	room.Leave(bob)
	eventually(t, "the room to drop itself", func() bool { return ss.roomCount() == 0 })

	if _, ok := ss.roomByCode(room.Code); ok {
		t.Fatal("the code still resolves to a stopped room")
	}
}

func TestCloseStopsEveryRoom(t *testing.T) {
	ss := NewScribbleServer()
	room, _ := createLobby(t, ss)
	player, _, err := room.Join("alice", uuid.Nil())
	if err != nil {
		t.Fatal(err)
	}

	ss.Close()

	// The player's socket is hung up, which is what tells their writer to stop.
	eventually(t, "the player's frames to close", func() bool {
		for {
			select {
			case _, ok := <-player.Frames():
				if !ok {
					return true
				}
			default:
				return false
			}
		}
	})
	if ss.roomCount() != 0 {
		t.Fatal("Close left rooms indexed")
	}
}

func TestOriginsAnswerThePreflight(t *testing.T) {
	ss := NewScribbleServer()
	defer ss.Close()

	req := httptest.NewRequest("OPTIONS", "/lobby", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	ss.ServeHTTP(w, req)

	if w.Code != 204 {
		t.Fatalf("preflight: got %d, want 204", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allow-origin = %q", got)
	}
	if got := w.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("vary = %q, want Origin", got)
	}

	// An origin we do not know gets no grant, but the response still varies.
	req = httptest.NewRequest("OPTIONS", "/lobby", nil)
	req.Header.Set("Origin", "http://evil.example")
	w = httptest.NewRecorder()
	ss.ServeHTTP(w, req)
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("granted an unknown origin: %q", got)
	}
}

func TestConfiguredOriginsAreGranted(t *testing.T) {
	// The LAN case: the frontend is served from this machine's address, so the
	// browser's Origin is neither of the defaults.
	t.Setenv(originsEnv, " http://192.168.1.183:3000/ ,")

	ss := NewScribbleServer()
	defer ss.Close()

	req := httptest.NewRequest("OPTIONS", "/lobby", nil)
	req.Header.Set("Origin", "http://192.168.1.183:3000")
	w := httptest.NewRecorder()
	ss.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://192.168.1.183:3000" {
		t.Fatalf("allow-origin = %q", got)
	}
	// The defaults survive alongside it, and the websocket check sees the same
	// list in the host:port form the handshake matches on.
	if !ss.allowed("http://localhost:3000") {
		t.Fatal("configured origins replaced the defaults")
	}
	if !slices.Contains(ss.originPatterns(), "192.168.1.183:3000") {
		t.Fatalf("origin patterns = %v", ss.originPatterns())
	}
}
