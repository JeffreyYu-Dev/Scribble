export type WordEntry = {
	word: string;
	/** BCP-47 tag, so the browser picks sane fonts for the script. */
	lang: string;
	dir: "ltr" | "rtl";
};

type WordSet = { lang: string; dir?: "ltr" | "rtl"; words: string[] };

/** Short, drawable nouns — the kind of prompt a real round would hand you. */
const SETS: WordSet[] = [
	{
		lang: "en",
		words: [
			"penguin",
			"lighthouse",
			"waffle",
			"octopus",
			"volcano",
			"cactus",
			"dragon",
			"castle",
		],
	},
	{
		lang: "fr",
		words: [
			"pingouin",
			"phare",
			"gaufre",
			"poulpe",
			"volcan",
			"cactus",
			"dragon",
			"château",
		],
	},
	{
		lang: "de",
		words: [
			"Pinguin",
			"Leuchtturm",
			"Waffel",
			"Krake",
			"Vulkan",
			"Kaktus",
			"Drache",
			"Schloss",
		],
	},
	{
		lang: "es",
		words: [
			"pingüino",
			"faro",
			"gofre",
			"pulpo",
			"volcán",
			"cactus",
			"dragón",
			"castillo",
		],
	},
	{
		lang: "pt",
		words: [
			"pinguim",
			"farol",
			"waffle",
			"polvo",
			"vulcão",
			"cacto",
			"dragão",
			"castelo",
		],
	},
	{
		lang: "zh",
		words: ["企鹅", "灯塔", "章鱼", "火山", "城堡", "太阳", "月亮", "蝴蝶"],
	},
	{
		lang: "ja",
		words: ["ペンギン", "灯台", "火山", "お城", "太陽", "花火", "風車", "提灯"],
	},
	{
		lang: "tl",
		words: [
			"pingwino",
			"parola",
			"pugita",
			"bulkan",
			"dragon",
			"kastilyo",
			"paruparo",
			"bahaghari",
		],
	},
	{
		lang: "ko",
		words: ["펭귄", "등대", "문어", "화산", "성곽", "태양", "나비", "무지개"],
	},
	{
		lang: "ru",
		words: [
			"пингвин",
			"маяк",
			"вафля",
			"осьминог",
			"вулкан",
			"кактус",
			"дракон",
			"замок",
		],
	},
];

/**
 * Round-robin across the sets, so consecutive words are always in different
 * languages rather than sitting through eight English words in a row.
 */
export const WORDS: WordEntry[] = (() => {
	const out: WordEntry[] = [];
	const longest = Math.max(...SETS.map((set) => set.words.length));

	for (let i = 0; i < longest; i++) {
		for (const set of SETS) {
			const word = set.words[i];
			if (word) out.push({ word, lang: set.lang, dir: set.dir ?? "ltr" });
		}
	}

	return out;
})();
