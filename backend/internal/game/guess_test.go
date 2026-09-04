package game

import (
	"testing"
	"time"
)

func TestMatchesIgnoresCaseAndSpacing(t *testing.T) {
	for _, guess := range []string{"sailboat", "  SailBoat ", "SAILBOAT"} {
		if !matches(guess, "sailboat") {
			t.Errorf("%q should be the word", guess)
		}
	}
	for _, guess := range []string{"sail boat", "sailboats", "boat"} {
		if matches(guess, "sailboat") {
			t.Errorf("%q should not be the word", guess)
		}
	}
	// A two-word answer only cares that the words are right, not the spacing.
	if !matches("SPIDER    web", "spider web") {
		t.Error("collapsed spacing should still match")
	}
}

func TestNearMissIsOneEditAndOnlyForLongerWords(t *testing.T) {
	close := []string{"lighthouse", "lighthose", "lighthoused", "lighthousr"}
	for _, guess := range close[1:] {
		if !nearMiss(guess, "lighthouse") {
			t.Errorf("%q is one edit from lighthouse", guess)
		}
	}
	// The word itself is not a near miss, and neither is something unrelated.
	if nearMiss("lighthouse", "lighthouse") {
		t.Error("the word is not a near miss")
	}
	if nearMiss("penguin", "lighthouse") {
		t.Error("penguin is not a near miss for lighthouse")
	}
	// One edit from a short word is half the dictionary.
	if nearMiss("kits", "kite") {
		t.Error("short words should not report near misses")
	}
}

func TestEditDistance(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"kitten", "kitten", 0},
		{"kitten", "sitten", 1},
		{"kitten", "kitte", 1},
		{"kitten", "kittens", 1},
		{"kitten", "sitting", 3},
		{"", "abc", 3},
	}
	for _, c := range cases {
		if got := editDistance([]rune(c.a), []rune(c.b)); got != c.want {
			t.Errorf("editDistance(%q, %q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestMaskHidesLettersAndKeepsSeparators(t *testing.T) {
	// The shape of the answer survives the mask and its letters do not, which
	// is what lets the client count "6 5" or "2-2" off a word nobody has yet.
	cases := map[string]string{
		"spider web": "______ ___",
		"yo-yo":      "__-__",
		"test-test":  "____-____",
		"a-123-bqwe": "_-___-____",
		"igloo":      "_____",
	}

	for word, want := range cases {
		if got := string(mask(word)); got != want {
			t.Errorf("mask(%q) = %q, want %q", word, got, want)
		}
	}
}

func TestHintScheduleAlwaysKeepsALetterBack(t *testing.T) {
	for _, word := range words {
		letters := 0
		for _, char := range word {
			if !separator(char) {
				letters++
			}
		}
		if got := len(hintSchedule(time.Now(), word)); got >= letters {
			t.Fatalf("%q: %d hints for %d letters gives the whole word away", word, got, letters)
		}
	}
}

func TestPickWordsAvoidsRecentOnes(t *testing.T) {
	// A room only ever holds `recentWords` of history against a list many times
	// longer, so a free word is found on the first draw or two. Over this many
	// trials a repeat would be a near certainty if it were not being excluded.
	if recentWords*4 > len(words) {
		t.Fatalf("%d recent words is too many to avoid out of %d", recentWords, len(words))
	}
	recent := append([]string(nil), words[:recentWords]...)

	for range 500 {
		choices := pickWords(recent, WordChoices)
		if len(choices) != WordChoices {
			t.Fatalf("dealt %d words, wanted %d", len(choices), WordChoices)
		}

		// A choice between the same word twice is not a choice.
		seen := make(map[string]bool, len(choices))
		for _, got := range choices {
			if seen[got] {
				t.Fatalf("pickWords offered %q twice: %v", got, choices)
			}
			seen[got] = true

			for _, used := range recent {
				if got == used {
					t.Fatalf("pickWords offered %q, which was played recently", got)
				}
			}
		}
	}
}
