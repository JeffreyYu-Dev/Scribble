package game

import (
	"math"
	"math/rand/v2"
	"strings"
	"time"
	"uuid"
)

/*
The turn: choosing a drawer and a word, giving letters away as the clock runs
down, scoring the guesses that land, and moving on.

Every function here is called from the room's goroutine, so none of them lock
anything, and `now` is passed in rather than read: a turn that ends because the
drawer left and one that ends because the clock ran out are the same code path,
and they should agree on when it happened.
*/

const (
	// A guess is worth a floor plus whatever is left on the clock, so the room
	// rewards getting there first without making a late guess worthless.
	guessBase  = 60
	guessBonus = 240
	// The drawer is paid per player who got there.
	drawerBonus = 30
)

// advance is the clock. It is the only thing that moves a room forward on its
// own; everything else happens because a player did something.
func (r *Room) advance(now time.Time) {
	switch r.phase {
	case phaseIdle:
		// Nothing. A room between games waits for its host to ask for the next
		// one and for nothing else — see `start`. This used to arm a countdown
		// the moment a second player arrived, which took a room that was still
		// choosing a game onto the board without being asked.

	case phaseChoosing:
		// A drawer who says nothing is not allowed to hold the room up, so the
		// clock makes the pick for them. Nothing to pick from would leave the
		// room stuck here, so it is treated as a turn that cannot be played.
		if now.After(r.deadline) {
			if len(r.choices) == 0 {
				r.nextTurn(now)
				return
			}
			r.chooseWord(now, rand.IntN(len(r.choices)))
		}

	case phaseDrawing:
		if now.After(r.deadline) {
			r.endTurn(now)
			return
		}
		r.giveHints(now)

	case phaseReveal:
		if now.After(r.deadline) {
			r.nextTurn(now)
		}
	}
}

func (r *Room) startGame(now time.Time) {
	for _, p := range r.players {
		p.Score = 0
		p.Gained = nil
	}
	r.round = 1
	r.recent = nil
	clear(r.drawn)
	r.nextTurn(now)
}

// nextTurn hands the pen to whoever has not held it this round, rolling into
// the next round — or out of the game — when everyone has.
func (r *Room) nextTurn(now time.Time) {
	if len(r.players) < MinPlayers {
		r.idle()
		return
	}

	drawer, ok := r.nextDrawer()
	if !ok {
		r.round++
		clear(r.drawn)
		if r.round > r.settings.Rounds {
			// The scoreboard stays as it finished; startGame clears it.
			r.idle()
			return
		}
		drawer, ok = r.nextDrawer()
		if !ok {
			r.idle()
			return
		}
	}

	r.beginTurn(now, drawer)
}

// nextDrawer is the longest-standing player who has not drawn this round.
// Taking them from `order` rather than the map is what keeps turns going round
// the room instead of in whatever order Go feels like.
func (r *Room) nextDrawer() (uuid.UUID, bool) {
	for _, id := range r.order {
		if _, ok := r.players[id]; ok && !r.drawn[id] {
			return id, true
		}
	}
	return uuid.Nil(), false
}

// beginTurn hands the pen over and deals the drawer their words. Nothing is
// drawn and nothing is guessed until one of them is picked — which is the point
// of the phase: the room knows whose turn it is a good deal before it knows
// what the turn is about.
func (r *Room) beginTurn(now time.Time, drawer uuid.UUID) {
	r.phase = phaseChoosing
	r.drawer = drawer
	r.drawn[drawer] = true

	r.choices = pickWords(r.recent, WordChoices, r.wordPool())
	r.word = ""
	r.hint = nil
	r.hintsAt = nil
	r.canvas = nil
	r.deadline = now.Add(choosePause)

	for _, p := range r.players {
		p.Guessed = false
		p.Gained = nil
	}

	// Blank paper first, then the turn it is for.
	r.broadcast(CanvasMessage{Type: "canvas", Commands: []DrawCommand{}})
	r.broadcastTurn(now)
	r.broadcastPlayers()
}

// pick is the drawer taking one of the words they were offered. Anyone else
// asking is ignored, and so is a second pick: the turn is already running on
// the first.
func (r *Room) pick(player *Player, choice int) {
	if r.phase != phaseChoosing || player.Id != r.drawer {
		return
	}
	r.chooseWord(time.Now(), choice)
}

// chooseWord settles on one of the words offered and starts the drawing. It is
// the only way out of phaseChoosing, whether the drawer picked or the clock did.
func (r *Room) chooseWord(now time.Time, choice int) {
	if r.phase != phaseChoosing || choice < 0 || choice >= len(r.choices) {
		return
	}

	r.word = r.choices[choice]
	r.choices = nil
	r.recent = append(r.recent, r.word)
	if len(r.recent) > recentWords {
		r.recent = r.recent[1:]
	}

	r.phase = phaseDrawing
	r.hint = mask(r.word)
	r.hintsAt = hintSchedule(now, r.word, r.settings.Hints, r.turnLength())
	r.deadline = now.Add(r.turnLength())

	r.broadcastTurn(now)
}

func (r *Room) endTurn(now time.Time) {
	if r.phase != phaseDrawing {
		return
	}
	r.phase = phaseReveal
	r.deadline = now.Add(revealPause)

	// The word goes out to everyone now, which is what turns the hint on screen
	// into the answer.
	r.broadcastTurn(now)
	r.broadcastPlayers()
}

// idle puts the room back in the lobby. Nothing is being waited on afterwards:
// the next game begins when the host asks for it, so there is no deadline for
// `advance` to trip over.
func (r *Room) idle() {
	r.phase = phaseIdle
	r.drawer = uuid.Nil()
	r.word = ""
	r.choices = nil
	r.hint = nil
	r.hintsAt = nil
	r.canvas = nil
	r.deadline = time.Time{}

	for _, p := range r.players {
		p.Guessed = false
	}

	r.broadcast(IdleMessage{Type: "idle"})
	r.broadcastPlayers()
}

/* ------------------------------------------------------------------ views */

func (r *Room) broadcastTurn(now time.Time) {
	// Sent one at a time rather than broadcast: the drawer's copy carries the
	// word and nobody else's may.
	for _, p := range r.players {
		r.send(p, TurnMessage{Type: "turn", Turn: r.turnView(p)})
	}
}

// turnView is the turn as `player` is allowed to see it. A nil player is nobody
// in particular, and is never shown the word.
func (r *Room) turnView(player *Player) TurnView {
	drawing := player != nil && player.Id == r.drawer

	view := TurnView{
		Round:       r.round,
		TotalRounds: r.settings.Rounds,
		Phase:       r.phase.name(),
		DrawerId:    r.drawer.String(),
		Hint:        string(r.hint),
		Seconds:     r.phaseSeconds(),
		EndsIn:      endsIn(r.deadline, time.Now()),
	}

	// The drawer needs the word for the whole turn; everyone else only once it
	// is over and there is nothing left to give away.
	if r.phase == phaseReveal || (r.phase == phaseDrawing && drawing) {
		word := r.word
		view.Word = &word
	}

	// Only the player who has to choose is told what there is to choose from.
	if r.phase == phaseChoosing && drawing {
		view.Choices = append([]string(nil), r.choices...)
	}

	return view
}

// phaseSeconds is how long the phase the room is in lasts in full. The client
// counts down against it, so it has to be the length of whatever `deadline` is
// currently waiting for rather than the length of a turn.
func (r *Room) phaseSeconds() int {
	switch r.phase {
	case phaseChoosing:
		return ChooseSeconds
	case phaseReveal:
		return RevealSeconds
	}
	return r.settings.DrawSeconds
}

// turnLength is how long a turn lasts, as the host set it.
func (r *Room) turnLength() time.Duration {
	return time.Duration(r.settings.DrawSeconds) * time.Second
}

func endsIn(deadline, now time.Time) int {
	left := int(math.Ceil(deadline.Sub(now).Seconds()))
	return max(left, 0)
}

/* ------------------------------------------------------------------ hints */

// separator is what stands between two runs of letters in a word. Neither is
// ever hidden: they are the shape of the answer rather than any of its letters,
// and a guesser told that the word is two runs of four has been told something
// they could count off the blanks anyway.
//
// It has to agree with `SEPARATORS` in the frontend's `word-hint.tsx`, which
// draws these as separators rather than as blanks to be filled in.
func separator(char rune) bool {
	return char == ' ' || char == '-'
}

// mask is the word with every letter hidden. Separators are left alone, so a
// two-word answer still reads as two words and a hyphenated one still reads as
// hyphenated.
func mask(word string) []rune {
	masked := []rune(word)
	for i, char := range masked {
		if !separator(char) {
			masked[i] = Hidden
		}
	}
	return masked
}

// hintSchedule spreads the host's letters evenly across the turn, always
// keeping at least one back — a fully revealed word is not a hint, so a short
// word gives away less than a long one however high the setting is.
//
// `hints` of zero is a room that wants none, and gets none.
func hintSchedule(start time.Time, word string, hints int, turn time.Duration) []time.Time {
	letters := 0
	for _, char := range word {
		if !separator(char) {
			letters++
		}
	}

	count := min(hints, letters-1)
	if count < 1 {
		return nil
	}

	at := make([]time.Time, 0, count)
	for i := 1; i <= count; i++ {
		at = append(at, start.Add(turn*time.Duration(i)/time.Duration(count+1)))
	}
	return at
}

func (r *Room) giveHints(now time.Time) {
	for len(r.hintsAt) > 0 && now.After(r.hintsAt[0]) {
		r.hintsAt = r.hintsAt[1:]
		r.revealLetter()
	}
}

func (r *Room) revealLetter() {
	word := []rune(r.word)

	hidden := make([]int, 0, len(r.hint))
	for i, char := range r.hint {
		if char == Hidden {
			hidden = append(hidden, i)
		}
	}
	if len(hidden) == 0 {
		return
	}

	at := hidden[rand.IntN(len(hidden))]
	r.hint[at] = word[at]
	r.broadcast(HintMessage{Type: "hint", Hint: string(r.hint)})
}

/* ----------------------------------------------------------------- guesses */

func (r *Room) guess(player *Player, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	if runes := []rune(text); len(runes) > maxGuess {
		text = string(runes[:maxGuess])
	}

	// Outside the drawing there is nothing to give away: either no word has been
	// settled on, or it is already on everyone's screen.
	if r.phase != phaseDrawing {
		r.post(chatFrom(player, text))
		return
	}

	// Whoever has the word — the drawer, and everyone who has already guessed it
	// — keeps talking, but only to each other. They used to be allowed to say
	// anything except the word itself, which was never the real problem: "not a
	// shoe, look at the paddle" hands the room the answer just as surely, and
	// silencing them instead only moved the conversation somewhere the game
	// could not see. So the line goes to the players who already know, and the
	// word is fair game there — everyone reading it has it.
	if player.Id == r.drawer || player.Guessed {
		r.postTo(chatFrom(player, text), ScopeGuessed, r.knowers())
		return
	}

	switch {
	case matches(text, r.word):
		r.award(player, time.Now())
		r.post(ChatEntry{
			Kind:     "correct",
			PlayerId: player.Id.String(),
			Player:   player.Username,
		})
		r.broadcastPlayers()
		if r.everyoneGuessed() {
			r.endTurn(time.Now())
		}

	case nearMiss(text, r.word):
		// To the player who typed it and nobody else: a public near miss would
		// be a hint the room did not earn.
		r.send(player, ChatMessage{
			Type:  "chat",
			Entry: r.entry(ChatEntry{Kind: "close", Text: text}),
		})

	default:
		r.post(chatFrom(player, text))
	}
}

// knowers is everyone the word is no secret from this turn: the drawer, and
// whoever has guessed it. It is taken fresh for each line rather than kept,
// because it grows as the turn runs — see `chatLine`, which is where each line
// remembers the audience it was written for.
func (r *Room) knowers() map[uuid.UUID]bool {
	audience := make(map[uuid.UUID]bool, len(r.players))
	for id, p := range r.players {
		if id == r.drawer || p.Guessed {
			audience[id] = true
		}
	}
	return audience
}

func chatFrom(player *Player, text string) ChatEntry {
	return ChatEntry{
		Kind:     "guess",
		PlayerId: player.Id.String(),
		Player:   player.Username,
		Text:     text,
	}
}

// award scores a correct guess, and pays the drawer for it.
func (r *Room) award(player *Player, now time.Time) {
	player.Guessed = true

	gain := guessScore(r.deadline.Sub(now), r.turnLength())
	player.Score += gain
	player.Gained = &gain

	drawer, ok := r.players[r.drawer]
	if !ok {
		return
	}
	earned := drawerBonus
	if drawer.Gained != nil {
		earned += *drawer.Gained
	}
	drawer.Score += drawerBonus
	drawer.Gained = &earned
}

// guessScore is the floor plus whatever is left on the clock, as a share of the
// whole turn — so a short turn is worth the same as a long one, and lowering the
// draw time does not quietly deflate the scoreboard.
func guessScore(remaining, turn time.Duration) int {
	left := float64(remaining) / float64(turn)
	left = min(max(left, 0), 1)
	return guessBase + int(math.Round(guessBonus*left))
}

// everyoneGuessed is what ends a turn early. The drawer does not count, and
// neither does a room that has nobody but them left in it.
func (r *Room) everyoneGuessed() bool {
	guessers := 0
	for _, p := range r.players {
		if p.Id == r.drawer {
			continue
		}
		guessers++
		if !p.Guessed {
			return false
		}
	}
	return guessers > 0
}

/* ------------------------------------------------------------------ canvas */

func (r *Room) draw(player *Player, commands []DrawCommand) {
	if r.phase != phaseDrawing || player.Id != r.drawer {
		return
	}
	if len(commands) > maxBatch {
		commands = commands[:maxBatch]
	}

	kept := make([]DrawCommand, 0, len(commands))
	for _, command := range commands {
		if !command.valid() {
			continue
		}
		kept = append(kept, command)

		if command.Kind == "clear" {
			r.canvas = nil
		} else if len(r.canvas) < maxCanvas {
			// Kept so a player arriving mid-turn can be shown the board. The
			// cap is a ceiling on one turn's drawing, not a scrollback.
			//
			// An undo is kept rather than applied: what it takes back is the
			// client's history to work out, and replaying the log through that
			// history is what puts a late arrival on the same board as everyone
			// else. Undoing here as well would be the same rule written twice.
			r.canvas = append(r.canvas, command)
		}
	}

	if len(kept) == 0 {
		return
	}
	// Not sent back to the drawer, who has already drawn it.
	r.broadcastExcept(player.Id, DrawMessage{Type: "draw", Commands: kept})
}
