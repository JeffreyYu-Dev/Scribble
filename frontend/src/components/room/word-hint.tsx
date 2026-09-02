import { cn } from "#/lib/utils.ts";

type WordHintProps = {
	word: string;
	/** Indices of the letters given away so far. Ignored when `reveal` is set. */
	revealed: number[];
	/** The drawer sees the whole word; everyone else only sees `revealed`. */
	reveal?: boolean;
	className?: string;
};

/**
 * The word on its blanks, the same row the home page teases. Spaces break the
 * run of bars so a two-word answer reads as two words.
 */
export function WordHint({
	word,
	revealed,
	reveal = false,
	className,
}: WordHintProps) {
	// Split by code point, not UTF-16 unit, so a surrogate pair stays one slot.
	const chars = [...word];
	const given = new Set(revealed);
	const letters = chars.filter((char) => char !== " ").length;

	return (
		<div
			role="img"
			className={cn("flex items-end justify-center gap-1.5", className)}
			aria-label={reveal ? `Your word is ${word}` : `${letters} letters`}
		>
			{chars.map((char, i) =>
				char === " " ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
					<span key={i} aria-hidden className="w-2" />
				) : (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
						key={i}
						aria-hidden
						className="flex min-w-3.5 flex-col items-center"
					>
						<span className="text-sm font-medium tracking-widest uppercase">
							{reveal || given.has(i) ? char : "\u00a0"}
						</span>
						{/*
							A blank that has been given away keeps its bar lit, so the
							hint reads as filling in rather than as a row of gaps. The
							drawer sees the whole word and needs no such marking.
						*/}
						<span
							className={cn(
								"h-px w-full",
								!reveal && given.has(i) ? "bg-primary" : "bg-border",
							)}
						/>
					</span>
				),
			)}
		</div>
	);
}
