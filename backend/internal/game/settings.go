package game

import "strings"

/*
What the host may change about a game before it starts.

The settings belong to the room rather than to the host's browser: they arrive
over the socket, are cleaned here, and go back out to everyone — so a player who
is not the host still sees what the room is about to play, and a reconnect finds
them in the snapshot rather than having to be told again.

Nothing here is trusted. The client sends whatever its UI happened to be holding
and `sanitize` decides what the room actually plays by, which is also what the
room echoes back: what a player sees is always what will happen.

Mirrored by `GameSettings` in the frontend's `lib/room/settings.ts`.
*/

// Where a turn's words come from.
const (
	// WordsDefault is the built-in list, and nothing else.
	WordsDefault = "default"
	// WordsMixed deals from the built-in list with the room's own words added
	// to it, so a custom bank flavours a game rather than replacing it.
	WordsMixed = "mixed"
	// WordsCustom is the room's words alone. A bank too short to deal a choice
	// from falls back to the built-in list — see wordPool.
	WordsCustom = "custom"
)

// Bounds on what a host may ask for. They are ranges rather than the fixed
// choices the UI offers: the client's list is what makes the settings readable
// at a glance, and this is only what makes them safe.
const (
	minRounds      = 1
	maxRounds      = 10
	minDrawSeconds = 15
	maxDrawSeconds = 300
	maxRoomPlayers = 24
	maxHints       = 5

	// MaxCustomWords and MaxWordLength bound the bank one room can hold. They
	// have to match the frontend's `settings.ts`, which trims the host's input
	// to the same shape before sending it.
	MaxCustomWords = 200
	MaxWordLength  = 32
)

// Settings is the room's configuration. Every field is sent to every player.
type Settings struct {
	Rounds int `json:"rounds"`
	// DrawSeconds is the length of one turn, which is what the timer ring
	// empties over.
	DrawSeconds int `json:"drawSeconds"`
	MaxPlayers  int `json:"maxPlayers"`
	// Hints is how many letters are given away over a turn. Always at least one
	// short of the whole word, however high it is set — see hintSchedule.
	Hints int `json:"hints"`
	// WordSource is which of the three above the turn's words come from.
	WordSource string `json:"wordSource"`
	// Words is the room's own bank. Cleaned by sanitize, and never nil: the
	// client parses it as an array.
	Words []string `json:"words"`
}

// DefaultSettings is what a room plays by until its host says otherwise. It has
// to match DEFAULT_SETTINGS in the frontend's `settings.ts`.
func DefaultSettings() Settings {
	return Settings{
		Rounds:      TotalRounds,
		DrawSeconds: TurnSeconds,
		MaxPlayers:  12,
		Hints:       2,
		WordSource:  WordsDefault,
		Words:       []string{},
	}
}

// sanitize is the requested settings as the room will actually play them.
//
// `seated` is how many players are already in the room, and is the floor under
// MaxPlayers: a host lowering the cap below the people standing in front of
// them is asking for someone to be thrown out, and shrinking the room is not
// worth that. The seats fill up instead.
//
// WordSource is deliberately kept as asked even when the bank is too short to
// honour it. Rewriting it here would fight the host as they type — the mode is
// chosen before the words are — so the shortfall is resolved at the point it
// matters, when a turn deals its choices.
func (s Settings) sanitize(seated int) Settings {
	clean := Settings{
		Rounds:      clamp(s.Rounds, minRounds, maxRounds),
		DrawSeconds: clamp(s.DrawSeconds, minDrawSeconds, maxDrawSeconds),
		MaxPlayers:  clamp(s.MaxPlayers, max(MinPlayers, seated), maxRoomPlayers),
		Hints:       clamp(s.Hints, 0, maxHints),
		WordSource:  s.WordSource,
		Words:       cleanWords(s.Words),
	}

	switch clean.WordSource {
	case WordsMixed, WordsCustom:
	default:
		clean.WordSource = WordsDefault
	}

	return clean
}

func clamp(value, low, high int) int {
	return min(max(value, low), high)
}

// cleanWords is the host's bank as the room will keep it: whitespace collapsed,
// over-long words cut, blanks dropped, and no word twice.
//
// Duplicates go by `normalize`, which is what a guess is matched with — two
// entries a player could not tell apart are one word, and keeping both would
// only make the same word likelier to be dealt.
func cleanWords(raw []string) []string {
	seen := make(map[string]bool, len(raw))
	clean := make([]string, 0, min(len(raw), MaxCustomWords))

	for _, word := range raw {
		word = strings.Join(strings.Fields(word), " ")
		if runes := []rune(word); len(runes) > MaxWordLength {
			word = strings.TrimSpace(string(runes[:MaxWordLength]))
		}
		if word == "" {
			continue
		}

		key := normalize(word)
		if seen[key] {
			continue
		}
		seen[key] = true

		clean = append(clean, word)
		if len(clean) == MaxCustomWords {
			break
		}
	}

	return clean
}

// wordPool is the list a turn deals its choices from.
//
// A custom-only bank shorter than one choice is the one case the room overrules
// its host: three words are dealt at once, and a bank of two would be dealt the
// same word twice. The built-in list stands in rather than the turn being
// unplayable, and the lobby says as much before the game starts.
func (r *Room) wordPool() []string {
	custom := r.settings.Words

	if r.settings.WordSource == WordsCustom {
		if len(custom) >= WordChoices {
			return custom
		}
		// Not enough to deal from, and the two or three that were typed are not
		// quietly mixed into the built-in list either: a host who asked for
		// their words alone should get a game that reads as the ordinary one,
		// not as theirs half-applied.
		return words
	}
	if r.settings.WordSource != WordsMixed || len(custom) == 0 {
		return words
	}

	pool := make([]string, 0, len(words)+len(custom))
	pool = append(pool, words...)
	return append(pool, custom...)
}
