const ADJECTIVES = [
	"squiggly",
	"crooked",
	"dotted",
	"smudged",
	"neon",
	"blunt",
	"jagged",
	"faint",
	"bold",
	"looping",
];

const NOUNS = [
	"pencil",
	"eraser",
	"crayon",
	"marker",
	"doodle",
	"stencil",
	"inkblot",
	"sketch",
	"chalk",
	"scribble",
];

/** Picks a throwaway display name so nobody has to think of one. */
export function randomName() {
	const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${adjective}-${noun}`;
}
