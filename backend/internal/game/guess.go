package game

import "strings"

// normalize is what "the same word" means here: case and spacing are the
// player's problem, not theirs to get exactly right. Everything else — spelling
// included — has to match, or `close` below would be doing nothing.
func normalize(text string) string {
	return strings.Join(strings.Fields(strings.ToLower(text)), " ")
}

// matches reports whether a guess is the word.
func matches(guess, word string) bool {
	return normalize(guess) == normalize(word)
}

// nearMiss reports whether a guess is one edit away from the word: the typo and
// the dropped letter, which are worth a nudge rather than a silent miss. Short
// words are excluded — one edit from "kite" is half the animal kingdom.
func nearMiss(guess, word string) bool {
	a, b := normalize(guess), normalize(word)
	if len(b) < 5 {
		return false
	}
	return editDistance([]rune(a), []rune(b)) == 1
}

// editDistance is Levenshtein, over one row rather than a full matrix: each row
// only ever reads the one above it, so the other rows are never needed.
func editDistance(a, b []rune) int {
	// One edit is all the caller cares about, and the distance is at least the
	// difference in length. Bailing here keeps a long guess cheap.
	if abs(len(a)-len(b)) > 1 {
		return abs(len(a) - len(b))
	}

	row := make([]int, len(b)+1)
	for j := range row {
		row[j] = j
	}

	for i := 1; i <= len(a); i++ {
		// `prev` is the cell diagonally up-left, which the write to row[j]
		// would otherwise have overwritten.
		prev := row[0]
		row[0] = i

		for j := 1; j <= len(b); j++ {
			carried := row[j]
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			row[j] = min(row[j]+1, row[j-1]+1, prev+cost)
			prev = carried
		}
	}

	return row[len(b)]
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
