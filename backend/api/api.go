package api

import (
	"net/http"
	"scribble/backend/internal/game"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

// this should contain stuff about the server ig

type ScribbleServer struct {
	// store all of the rooms in here?
	logf  func(f string, v ...any)
	Rooms map[uuid.UUID]*game.Room
}

func (ss *ScribbleServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{})

	if err != nil {
		ss.logf("%v", err)
		return
	}

	defer conn.CloseNow()

	// what do i do with the connection now?
	// find where the connection belongs to
	// it's either a new game or joining a lobby
	// we listen to onconnect and the client will send a message

	for {

	}

}
