package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
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

// ScribbleServer is the HTTP and websocket surface. It owns the room index and
// nothing else: a room runs itself, and everything about a game happens inside
// one. What is left here is finding the right room for a socket and pumping
// bytes between the two.
type ScribbleServer struct {
	logf func(f string, v ...any)

	// mu guards the two indexes and the connection set. The rooms behind them
	// have their own goroutines and need no help from it.
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
		origins: allowedOrigins(),
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

const (
	// joinTimeout bounds how long a connected client may sit without
	// identifying itself, so an idle socket cannot hold a slot open forever.
	joinTimeout = 10 * time.Second

	// codeAttempts bounds how many times room creation retries on a code that
	// is already in use before giving up.
	codeAttempts = 10

	// readLimit is the largest frame a client may send. A batched stroke is by
	// far the biggest of them, and the library's default is smaller than one.
	readLimit = 256 << 10

	// usernameMax has to match NAME_MAX in the frontend's schemas.ts.
	usernameMax = 16

	// A socket that has gone quiet is otherwise invisible until its player is
	// expected to do something, which in a drawing game can be a whole turn.
	pingInterval = 30 * time.Second
	pingTimeout  = 10 * time.Second
	writeTimeout = 10 * time.Second
)

// devOrigins are the browser origins allowed to call this server. The frontend
// runs on its own port in development, so requests are cross-origin: without
// these the fetch is blocked by CORS and the websocket handshake is rejected.
var devOrigins = []string{"http://localhost:3000", "http://127.0.0.1:3000"}

// originsEnv names the variable that adds origins to the defaults, comma
// separated. Playing over a LAN is the case that needs it: the other players'
// browsers load the frontend from this machine's address rather than from
// localhost, and to a browser that is a different origin no matter that it is
// the same server. Listed rather than inferred, because "anything on this
// network" is not a call this server can make on its own.
const originsEnv = "SCRIBBLE_ORIGINS"

// allowedOrigins is the defaults plus whatever originsEnv names.
func allowedOrigins() []string {
	origins := slices.Clone(devOrigins)
	for _, origin := range strings.Split(os.Getenv(originsEnv), ",") {
		// A trailing slash is easy to paste in and would never match: an Origin
		// header carries a scheme, a host and a port, and nothing after them.
		origin = strings.TrimSuffix(strings.TrimSpace(origin), "/")
		if origin != "" && !slices.Contains(origins, origin) {
			origins = append(origins, origin)
		}
	}
	return origins
}

// createRoom makes a room and registers it under a code no live room is
// already using. Without the check a collision would overwrite byCode and
// strand the older room: unreachable, but still holding its players.
func (ss *ScribbleServer) createRoom(owner uuid.UUID) (*game.Room, error) {
	for range codeAttempts {
		room, err := game.CreateRoom()
		if err != nil {
			return nil, err
		}
		// Reserved before the room is started: afterwards this field belongs to
		// the room's own goroutine.
		room.SetOwner(owner)

		ss.mu.Lock()
		_, taken := ss.byCode[room.Code]
		if !taken {
			ss.Rooms[room.Id] = room
			ss.byCode[room.Code] = room
		}
		ss.mu.Unlock()

		if taken {
			continue
		}

		// Started only once it is findable, so a room cannot drop itself from
		// an index it has not been put in yet.
		room.Start(func() { ss.removeRoom(room) })
		return room, nil
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

// removeRoom drops a room from both indexes. Called by the room itself, once,
// as it stops.
func (ss *ScribbleServer) removeRoom(room *game.Room) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.deleteRoomLocked(room)
	ss.logf("room %v closed", room.Code)
}

// deleteRoomLocked drops a room from both indexes. Callers must hold mu.
func (ss *ScribbleServer) deleteRoomLocked(room *game.Room) {
	delete(ss.Rooms, room.Id)
	delete(ss.byCode, room.Code)
}

// Sweep drops rooms that have sat empty for longer than grace: lobbies that
// were created but never joined. A room with players in it stops itself when
// the last one leaves, so an in-progress game is never touched here. It returns
// how many it removed.
func (ss *ScribbleServer) Sweep(grace time.Duration) int {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	removed := 0
	for _, room := range ss.Rooms {
		if room.Population() == 0 && time.Since(room.CreatedAt) > grace {
			// Shutdown only closes a channel, so this does not wait on the
			// room's goroutine — which will want this very lock on its way out.
			room.Shutdown()
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

// Close tells every connected client the server is going away and stops every
// room. Safe to call more than once.
func (ss *ScribbleServer) Close() {
	ss.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(ss.conns))
	for conn := range ss.conns {
		conns = append(conns, conn)
	}
	rooms := make([]*game.Room, 0, len(ss.Rooms))
	for _, room := range ss.Rooms {
		rooms = append(rooms, room)
	}
	clear(ss.conns)
	clear(ss.Rooms)
	clear(ss.byCode)
	ss.mu.Unlock()

	// Both loops run outside the lock: closing a socket writes a close frame,
	// and each handler calls removeConn on its way out.
	for _, room := range rooms {
		room.Shutdown()
	}
	for _, conn := range conns {
		conn.Close(websocket.StatusGoingAway, "server shutting down")
	}
}

// routes registers every endpoint on the server's own mux.
func (ss *ScribbleServer) routes() {
	ss.serveMux.HandleFunc("POST /lobby", ss.createLobby)
	ss.serveMux.HandleFunc("/scribble", ss.scribble)
}

func (ss *ScribbleServer) createLobby(w http.ResponseWriter, r *http.Request) {
	var body Player
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		ss.logf("%v", err)
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(body.Username) == "" {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}

	// The creator is not a player yet: they become one when their socket
	// connects. Until then the room is empty and the sweeper can reclaim it.
	// All that exists now is the id that lets them claim ownership.
	ownerId := uuid.New()

	room, err := ss.createRoom(ownerId)
	if err != nil {
		ss.logf("%v", err)
		http.Error(w, "Could not generate code", http.StatusInternalServerError)
		return
	}

	res := CreateLobbyResponse{Code: room.Code, PlayerId: ownerId}
	if err := tools.WriteJSON(w, http.StatusCreated, res); err != nil {
		ss.logf("%v", err)
	}
}

// scribble is the game socket. It reads the join, hands the player to their
// room, and then does nothing but carry bytes in both directions: everything
// the frames mean is decided inside the room.
func (ss *ScribbleServer) scribble(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: ss.originPatterns(),
	})
	if err != nil {
		ss.logf("%v", err)
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(readLimit)

	ss.addConn(conn)
	defer ss.removeConn(conn)

	room, player, err := ss.join(r.Context(), conn)
	if err != nil {
		// Reported as a close frame: the HTTP response is already spent.
		conn.Close(websocket.StatusPolicyViolation, err.Error())
		return
	}
	// The room is dropped here once its last player disconnects.
	defer room.Leave(player)

	ss.logf("%v joined room %v", player.Username, room.Code)

	// One goroutine writes and this one reads: a websocket takes one writer at
	// a time, and the room must never have to wait on a socket.
	ctx, stop := context.WithCancel(r.Context())
	defer stop()
	go writeFrames(ctx, conn, player)

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		room.Receive(player, data)
	}
}

// join reads the client's first message and puts it in a room. The error is
// what the client is told on the way out, so it is written for them.
func (ss *ScribbleServer) join(
	ctx context.Context,
	conn *websocket.Conn,
) (*game.Room, *game.Player, error) {
	joinCtx, cancel := context.WithTimeout(ctx, joinTimeout)
	defer cancel()

	var request game.JoinRequest
	if err := wsjson.Read(joinCtx, conn, &request); err != nil {
		ss.logf("join: %v", err)
		return nil, nil, errors.New("expected a join message")
	}

	code := strings.ToUpper(strings.TrimSpace(request.Code))
	username := strings.TrimSpace(request.Username)
	if code == "" || username == "" {
		return nil, nil, errors.New("code and username are required")
	}
	if runes := []rune(username); len(runes) > usernameMax {
		username = string(runes[:usernameMax])
	}

	// The creator sends back the id from POST /lobby; the room decides whether
	// it matches the one it is holding. Everyone else claims nothing.
	claim := uuid.Nil()
	if request.PlayerId != "" {
		parsed, err := uuid.Parse(request.PlayerId)
		if err != nil {
			return nil, nil, errors.New("invalid player id")
		}
		claim = parsed
	}

	room, ok := ss.roomByCode(code)
	if !ok {
		return nil, nil, errors.New("no such room")
	}

	// A room can stop between being found and being joined: the code was live a
	// moment ago, and its last player has since left.
	player, _, err := room.Join(username, claim)
	if err != nil {
		return nil, nil, errors.New("no such room")
	}

	return room, player, nil
}

// writeFrames is the only thing that writes to this socket. It ends when the
// room is done with the player, when a write fails, or when the reader stops.
func writeFrames(ctx context.Context, conn *websocket.Conn, player *game.Player) {
	// Closing the socket is what unblocks the reader, so this has to happen
	// however the loop ends.
	defer conn.CloseNow()

	ping := time.NewTicker(pingInterval)
	defer ping.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case data, ok := <-player.Frames():
			if !ok {
				conn.Close(websocket.StatusNormalClosure, "")
				return
			}
			if err := write(ctx, conn, data); err != nil {
				return
			}

		case <-ping.C:
			pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := conn.Ping(pingCtx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func write(ctx context.Context, conn *websocket.Conn, data []byte) error {
	writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return conn.Write(writeCtx, websocket.MessageText, data)
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
