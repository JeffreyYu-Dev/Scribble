package game

import (
	"time"
	"uuid"
)

// incoming

// outgoing

// program services?
type Room struct {
	id      uuid.UUID
	players map[uuid.UUID]*Player
	owner   uuid.UUID
}

func CreateRoom(creatorId uuid.UUID) *Room {
	r := &Room{
		id: uuid.New(),
	}

	return r
}

func (r *Room) addPlayer(player *Player) {
	r.players[player.id] = player
}

func (r *Room) setHost(playerId uuid.UUID) {
	r.owner = playerId
}

func (r *Room) PromoteHost() {
	// based on the joined time the player becomes host
	newHost := func() *Player {
		var candidate *Player

		for _, player := range r.players {
			if candidate == nil || player.joinedAt.Before(candidate.joinedAt) {
				candidate = player
			}
		}

		return candidate

	}()

	if newHost == nil {
		return
	}

	r.setHost(newHost.id)

}

type Player struct {
	id       uuid.UUID
	username string
	joinedAt time.Time
}

func CreatePlayer(username string) *Player {
	return &Player{
		id:       uuid.New(),
		username: username,
		joinedAt: time.Now(),
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
