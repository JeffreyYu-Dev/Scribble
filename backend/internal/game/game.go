package game

import (
	"crypto/rand"
	"math/big"
	"time"
	"uuid"
)

// incoming

// outgoing

// program services?
type Room struct {
	Id      uuid.UUID
	Code    string
	Players map[uuid.UUID]*Player
	// Owner is reserved when the room is created and claimed when that
	// player opens their websocket.
	Owner     uuid.UUID
	CreatedAt time.Time
}

// CodeLength is the number of characters in a room code. It has to match
// CODE_LENGTH in the frontend's schemas.ts, which masks the join input.
const CodeLength = 5

func CreateRoom() (*Room, error) {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"

	code, err := func() (string, error) {
		res := make([]byte, CodeLength)

		for i := range CodeLength {
			char, err := rand.Int(rand.Reader, big.NewInt(int64(len(characters))))
			if err != nil {
				return "", err
			}
			res[i] = characters[char.Int64()]
		}
		return string(res), nil
	}()

	if err != nil {
		return nil, err
	}

	r := &Room{
		Id:        uuid.New(),
		Code:      code,
		Players:   make(map[uuid.UUID]*Player),
		CreatedAt: time.Now(),
	}

	return r, err
}

func (r *Room) AddPlayer(player *Player) {
	r.Players[player.Id] = player
}

func (r *Room) RemovePlayer(playerId uuid.UUID) {
	delete(r.Players, playerId)
}

func (r *Room) SetOwner(playerId uuid.UUID) {
	r.Owner = playerId
}

func (r *Room) PromoteOwner() {
	// based on the joined time the player becomes host
	newHost := func() *Player {
		var candidate *Player

		for _, player := range r.Players {
			if candidate == nil || player.JoinedAt.Before(candidate.JoinedAt) {
				candidate = player
			}
		}

		return candidate

	}()

	if newHost == nil {
		return
	}

	r.SetOwner(newHost.Id)

}

type Player struct {
	Id       uuid.UUID
	Username string
	JoinedAt time.Time
}

func CreatePlayer(username string) *Player {
	return CreatePlayerWithId(uuid.New(), username)
}

// CreatePlayerWithId builds a player around an id issued earlier, so the room
// creator can prove they are the same person when their socket connects.
func CreatePlayerWithId(id uuid.UUID, username string) *Player {
	return &Player{
		Id:       id,
		Username: username,
		JoinedAt: time.Now(),
	}
}

type Canvas struct {
}

type Chat struct {
}

type Leaderboard struct {
}

type Round struct {
}
