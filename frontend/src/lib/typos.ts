/** Keys physically adjacent on a QWERTY board, so a slip looks like a real one. */
const QWERTY: Record<string, string> = {
	q: "wa",
	w: "qes",
	e: "wrd",
	r: "etf",
	t: "ryg",
	y: "tuh",
	u: "yij",
	i: "uok",
	o: "ipl",
	p: "ol",
	a: "qsz",
	s: "awdx",
	d: "serfc",
	f: "drtgv",
	g: "ftyhb",
	h: "gyujn",
	j: "huikm",
	k: "jiol",
	l: "kop",
	z: "asx",
	x: "zsdc",
	c: "xdfv",
	v: "cfgb",
	b: "vghn",
	n: "bhjm",
	m: "njk",
};

/** The same idea for a Russian ЙЦУКЕН board. */
const JCUKEN: Record<string, string> = {
	й: "цф",
	ц: "йуфы",
	у: "цкыв",
	к: "уевап",
	е: "кнапр",
	н: "егпро",
	г: "ншрол",
	ш: "гщолд",
	щ: "шзлдж",
	з: "щхджэ",
	х: "зъжэ",
	ъ: "хэ",
	ф: "йцыя",
	ы: "цувфач",
	в: "укамыс",
	а: "кепвсм",
	п: "енрами",
	р: "нгоипт",
	о: "гшлрть",
	л: "шщдоьб",
	д: "щзжлбю",
	ж: "зхэдю",
	э: "хъж",
	я: "фыч",
	ч: "ывся",
	с: "вачм",
	м: "апси",
	и: "првмт",
	т: "роиь",
	ь: "олтб",
	б: "лдью",
	ю: "джбь",
};

/**
 * A plausible mistyping of `char` — a key next to it on the board its script is
 * typed with. Returns `null` for scripts we have no layout for (Arabic, and the
 * CJK languages, where words are composed through an input method rather than
 * struck key-for-key, so "hit the adjacent key" is not a mistake that happens).
 */
export function nearbyKey(char: string): string | null {
	// Strip diacritics first, so ü and ã slip the way u and a would.
	const lower = char
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
	const options = QWERTY[lower] ?? JCUKEN[lower];
	if (!options) return null;

	return options[Math.floor(Math.random() * options.length)];
}
