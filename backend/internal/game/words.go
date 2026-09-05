package game

import "math/rand/v2"

var words = []string{
	"anchor", "avocado", "backpack", "balloon", "bicycle", "birdhouse",
	"bonfire", "bridge", "bucket", "butterfly", "cactus", "camera", "campfire",
	"candle", "canoe", "castle", "cauldron", "chandelier", "compass", "crayon",
	"crocodile", "cupcake", "dinosaur", "dolphin", "doorbell", "dragon",
	"drum", "elephant", "envelope", "feather", "ferris wheel", "fireplace",
	"flamingo", "fountain", "giraffe", "glacier", "guitar", "hammock",
	"hedgehog", "helicopter", "hourglass", "igloo", "jellyfish", "kangaroo",
	"kettle", "kite", "ladder", "lantern", "lighthouse", "lobster", "mailbox",
	"mermaid", "microscope", "mushroom", "narwhal", "octopus", "otter",
	"paintbrush", "pancake", "parachute", "peacock", "penguin", "piano",
	"pineapple", "pinwheel", "popcorn", "pretzel", "pumpkin", "raccoon",
	"rainbow", "robot", "rocket", "sailboat", "sandcastle", "scarecrow",
	"seahorse", "skateboard", "snowman", "spider web", "starfish", "submarine",
	"sunflower", "telescope", "tent", "tractor", "treehouse", "trophy",
	"tulip", "turtle", "umbrella", "violin", "volcano", "waffle", "watermelon",
	"waterfall", "whale", "windmill", "wizard", "yo-yo", "zebra",
}

// pickWords deals the words a drawer chooses between, out of whichever list the
// room is playing from — see Room.wordPool. It avoids the ones the room has
// used recently, so a short game does not hand out the same thing twice, and
// holds the words already dealt against the rest, so no choice offers the same
// word twice.
func pickWords(recent []string, count int, pool []string) []string {
	if len(pool) == 0 {
		pool = words
	}

	used := make(map[string]bool, len(recent)+count)
	for _, word := range recent {
		used[word] = true
	}

	choices := make([]string, 0, count)
	for range count {
		word := pickWord(used, pool)
		used[word] = true
		choices = append(choices, word)
	}
	return choices
}

// pickWord chooses one word from the pool that is not in `used`.
func pickWord(used map[string]bool, pool []string) string {
	// Bounded rather than a filtered copy: `used` is short and the list is
	// usually long, so a handful of draws almost always lands on a free word.
	// Falling through to a repeat is better than looping forever if it does not
	// — which is the case a bank barely bigger than one choice runs into.
	for range 20 {
		word := pool[rand.IntN(len(pool))]
		if !used[word] {
			return word
		}
	}
	return pool[rand.IntN(len(pool))]
}
