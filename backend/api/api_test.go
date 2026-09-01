package api

import (
	"net/http/httptest"
	"scribble/backend/internal/game"
	"strings"
	"testing"
)

func createLobby(t *testing.T, ss *ScribbleServer) *game.Room {
	t.Helper()
	req := httptest.NewRequest("POST", "/lobby", strings.NewReader(`{"username":"jeff"}`))
	w := httptest.NewRecorder()
	ss.ServeHTTP(w, req)
	if w.Code != 201 {
		t.Fatalf("create: got %d", w.Code)
	}
	for _, room := range ss.Rooms {
		return room
	}
	t.Fatal("no room created")
	return nil
}

func TestSweepRemovesNeverJoined(t *testing.T) {
	ss := NewScribbleServer()
	createLobby(t, ss)

	if n := ss.Sweep(0); n != 1 {
		t.Fatalf("swept %d, want 1", n)
	}
	if len(ss.Rooms) != 0 || len(ss.byCode) != 0 {
		t.Fatalf("indexes not cleared: Rooms=%d byCode=%d", len(ss.Rooms), len(ss.byCode))
	}
}

func TestSweepKeepsOccupied(t *testing.T) {
	ss := NewScribbleServer()
	room := createLobby(t, ss)
	ss.joinRoom(room, game.CreatePlayer("bob"))

	if n := ss.Sweep(0); n != 0 {
		t.Fatalf("swept an occupied room")
	}
	if room.Owner != room.Players[room.Owner].Id {
		t.Fatal("owner not present in an occupied room")
	}
}

func TestLastPlayerLeavingRemovesRoom(t *testing.T) {
	ss := NewScribbleServer()
	room := createLobby(t, ss)
	alice := game.CreatePlayer("alice")
	bob := game.CreatePlayer("bob")
	ss.joinRoom(room, alice)
	ss.joinRoom(room, bob)

	ss.removePlayer(room, alice.Id)
	if len(ss.Rooms) != 1 {
		t.Fatal("room dropped while bob was still in it")
	}
	if room.Owner != bob.Id {
		t.Fatal("ownership not promoted to bob")
	}

	ss.removePlayer(room, bob.Id)
	if len(ss.Rooms) != 0 || len(ss.byCode) != 0 {
		t.Fatalf("room not removed: Rooms=%d byCode=%d", len(ss.Rooms), len(ss.byCode))
	}
}
