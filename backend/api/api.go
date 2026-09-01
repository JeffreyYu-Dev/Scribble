package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"scribble/backend/internal/game"
	"scribble/backend/internal/tools"
	"slices"
	"strings"
	"sync"
	"time"
	"uuid"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// this should contain stuff about the server ig

type ScribbleServer struct {
	// store all of the rooms in here?
	logf func(f string, v ...any)

	// mu guards Rooms, byCode, conns, and the contents of each Room: every
	// request and every websocket runs in its own goroutine.
	mu    sync.Mutex
	Rooms map[uuid.UUID]*game.Room
	// byCode indexes the same rooms by the code players type in.
	byCode   map[string]*game.Room
	conns    map[*websocket.Conn]struct{}
	origins  []string
	serveMux http.ServeMux
}

func NewScribbleServer() *ScribbleServer {
	ss := &ScribbleServer{
		logf:    log.Printf,
		Rooms:   make(map[uuid.UUID]*game.Room),
		byCode:  make(map[string]*game.Room),
		conns:   make(map[*websocket.Conn]struct{}),
		origins: devOrigins,
	}
	ss.routes()
	return ss
}

type Player struct {
	Username string `json:"username"`
}

type CreateLobbyResponse struct {
	Code string `json:"code"`
	// PlayerId is the id the creator sends back on the websocket to claim
	// ownership of the room.
	PlayerId uuid.UUID `json:"playerId"`
}

// JoinRequest is the first message a client sends after connecting. Sending
// it over the socket instead of the URL keeps the player id out of browser
// history and request logs.
type JoinRequest struct {
	Code     string `json:"code"`
	Username string `json:"username"`
	// PlayerId is the id POST /lobby issued to the room's creator. Empty for
	// everyone else, who are assigned a fresh id on join.
	PlayerId string `json:"playerId,omitempty"`
}

// JoinResponse confirms the join and tells the client which player it is.
type JoinResponse struct {
	PlayerId uuid.UUID `json:"playerId"`
	Code     string    `json:"code"`
	Owner    bool      `json:"owner"`
}

// joinTimeout bounds how long a connected client may sit without identifying
// itself, so an idle socket cannot hold a slot open forever.
const joinTimeout = 10 * time.Second

// codeAttempts bounds how many times room creation retries on a code that is
// already in use before giving up.
const codeAttempts = 10

// devOrigins are the browser origins allowed to call this server. The frontend
// runs on its own port in development, so requests are cross-origin: without
// these the fetch is blocked by CORS and the websocket handshake is rejected.
var devOrigins = []string{"http://localhost:3000", "http://127.0.0.1:3000"}

// createRoom makes a room and registers it under a code no live room is
// already using. Without the check a collision would overwrite byCode and
// strand the older room: unreachable, but still holding its players.
func (ss *ScribbleServer) createRoom() (*game.Room, error) {
	for range codeAttempts {
		room, err := game.CreateRoom()
		if err != nil {
			return nil, err
		}

		ss.mu.Lock()
		_, taken := ss.byCode[room.Code]
		if !taken {
			ss.Rooms[room.Id] = room
			ss.byCode[room.Code] = room
		}
		ss.mu.Unlock()

		if !taken {
			return room, nil
		}
	}
	return nil, errors.New("no free room code")
}

// roomByCode finds a room by the code a player typed.
func (ss *ScribbleServer) roomByCode(code string) (*game.Room, bool) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	room, ok := ss.byCode[code]
	return room, ok
}

// deleteRoomLocked drops a room from both indexes. Callers must hold mu.
func (ss *ScribbleServer) deleteRoomLocked(room *game.Room) {
	delete(ss.Rooms, room.Id)
	delete(ss.byCode, room.Code)
}

// joinRoom adds a connected player to a room. If the reserved owner never
// turned up, the room is handed to whoever is actually here.
func (ss *ScribbleServer) joinRoom(room *game.Room, player *game.Player) {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	room.AddPlayer(player)

	if _, ok := room.Players[room.Owner]; !ok {
		room.PromoteOwner()
	}
}

// removePlayer drops a player from its room, deleting the whole room once the
// last player leaves. If the owner was the one leaving, a remaining player is
// promoted so a live room always has an owner.
func (ss *ScribbleServer) removePlayer(room *game.Room, playerId uuid.UUID) {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	room.RemovePlayer(playerId)

	if len(room.Players) == 0 {
		ss.deleteRoomLocked(room)
		ss.logf("room %v is empty, removed", room.Code)
		return
	}

	if room.Owner == playerId {
		room.PromoteOwner()
	}
}

// Sweep drops rooms that have sat empty for longer than grace: lobbies that
// were created but never joined. Rooms with players are never touched, so an
// in-progress game outlives any grace period. It returns how many it removed.
func (ss *ScribbleServer) Sweep(grace time.Duration) int {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	removed := 0
	for _, room := range ss.Rooms {
		if len(room.Players) == 0 && time.Since(room.CreatedAt) > grace {
			ss.deleteRoomLocked(room)
			removed++
		}
	}
	if removed > 0 {
		ss.logf("swept %d abandoned room(s)", removed)
	}
	return removed
}

// addConn and removeConn track live websockets so Close can shut them down.
func (ss *ScribbleServer) addConn(conn *websocket.Conn) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.conns[conn] = struct{}{}
}

func (ss *ScribbleServer) removeConn(conn *websocket.Conn) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	delete(ss.conns, conn)
}

// Close tells every connected client the server is going away and drops all
// room state. Safe to call more than once.
func (ss *ScribbleServer) Close() {
	ss.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(ss.conns))
	for conn := range ss.conns {
		conns = append(conns, conn)
	}
	clear(ss.conns)
	clear(ss.Rooms)
	clear(ss.byCode)
	ss.mu.Unlock()

	// Closed outside the lock: this writes a close frame, and each handler
	// calls removeConn on its way out.
	for _, conn := range conns {
		conn.Close(websocket.StatusGoingAway, "server shutting down")
	}
}

// routes registers every endpoint on the server's own mux.
func (ss *ScribbleServer) routes() {
	ss.serveMux.HandleFunc("POST /lobby", func(w http.ResponseWriter, r *http.Request) {
		// take the body from the request and write back the room code after creating the lobby

		var body Player

		err := json.NewDecoder(r.Body).Decode(&body)

		if err != nil {
			ss.logf("%v", err)
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(body.Username) == "" {
			http.Error(w, "Username is required", http.StatusBadRequest)
			return
		}

		// create the rooom

		newRoom, err := ss.createRoom()
		if err != nil {
			ss.logf("%v", err)
			http.Error(w, "Could not generate code", http.StatusInternalServerError)
			return
		}

		// The creator is not a player yet: they become one when their socket
		// connects. Until then the room is empty and the sweeper can reclaim
		// it. We only reserve the id that lets them claim ownership.
		ownerId := uuid.New()
		newRoom.SetOwner(ownerId)

		res := CreateLobbyResponse{Code: newRoom.Code, PlayerId: ownerId}
		if err := tools.WriteJSON(w, http.StatusCreated, res); err != nil {
			ss.logf("%v", err)
		}

	})
	ss.serveMux.HandleFunc("/scribble", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: ss.originPatterns(),
		})

		if err != nil {
			ss.logf("%v", err)
			return
		}

		defer conn.CloseNow()

		ss.addConn(conn)
		defer ss.removeConn(conn)

		// The client identifies itself in its first message. Failures here are
		// reported as close frames, since the HTTP response is already spent.
		joinCtx, cancel := context.WithTimeout(r.Context(), joinTimeout)
		defer cancel()

		var join JoinRequest
		if err := wsjson.Read(joinCtx, conn, &join); err != nil {
			ss.logf("join: %v", err)
			conn.Close(websocket.StatusPolicyViolation, "expected a join message")
			return
		}

		code := strings.ToUpper(strings.TrimSpace(join.Code))
		username := strings.TrimSpace(join.Username)
		if code == "" || username == "" {
			conn.Close(websocket.StatusPolicyViolation, "code and username are required")
			return
		}

		room, ok := ss.roomByCode(code)
		if !ok {
			conn.Close(websocket.StatusPolicyViolation, "no such room")
			return
		}

		// The creator sends back the id from POST /lobby; matching the
		// reserved owner is what makes them the owner. Everyone else joins
		// under a fresh id.
		playerId := uuid.New()
		if join.PlayerId != "" {
			claimed, err := uuid.Parse(join.PlayerId)
			if err != nil {
				conn.Close(websocket.StatusPolicyViolation, "invalid player id")
				return
			}
			if claimed == room.Owner {
				playerId = claimed
			}
		}

		player := game.CreatePlayerWithId(playerId, username)
		ss.joinRoom(room, player)
		// The room is dropped here once its last player disconnects.
		defer ss.removePlayer(room, player.Id)

		ss.logf("%v joined room %v", player.Username, room.Code)

		res := JoinResponse{PlayerId: player.Id, Code: room.Code, Owner: room.Owner == player.Id}
		if err := wsjson.Write(r.Context(), conn, res); err != nil {
			ss.logf("join ack: %v", err)
			return
		}

		for {
			// TODO: route the message once the protocol exists.
			_, _, err := conn.Read(r.Context())
			if err != nil {
				ss.logf("read: %v", err)
				return
			}
		}
	})
}

// originPatterns is the host:port form websocket.Accept matches against.
func (ss *ScribbleServer) originPatterns() []string {
	patterns := make([]string, 0, len(ss.origins))
	for _, origin := range ss.origins {
		if parsed, err := url.Parse(origin); err == nil {
			patterns = append(patterns, parsed.Host)
		}
	}
	return patterns
}

func (ss *ScribbleServer) allowed(origin string) bool {
	return slices.Contains(ss.origins, origin)
}

func (ss *ScribbleServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// The browser sends the game requests from another port, so they are
	// cross-origin and need CORS headers plus an answer to the preflight.
	if origin := r.Header.Get("Origin"); ss.allowed(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	}
	// Vary regardless of the outcome: the response body is the same for every
	// origin but these headers are not, and caches key on it.
	w.Header().Add("Vary", "Origin")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	ss.serveMux.ServeHTTP(w, r)
}
