import { cn } from "#/lib/utils.ts";

type WordHintProps = {
  word: string;
  revealed: number[];
  reveal?: boolean;
  className?: string;
};

const SEPARATORS = new Set([" ", "-"]);

/**
 * The word on its blanks, the same row the home page teases. Spaces break the
 * run of bars so a two-word answer reads as two words, a hyphen is drawn where
 * it falls, and the count beside them says how long each run is.
 */
export function WordHint({
  word,
  revealed,
  reveal = false,
  className,
}: WordHintProps) {
  const chars = [...word];
  const given = new Set(revealed);
  const { runs, separators } = shape(chars);
  const letters = runs.reduce((total, run) => total + run, 0);

  return (
    <div
      role="img"
      className={cn("flex items-end justify-center gap-1.5", className)}
      aria-label={
        reveal
          ? `Your word is ${word}`
          : runs.length > 1
            ? `${letters} letters in ${runs.length} parts`
            : `${letters} letters`
      }
    >
      {chars.map((char, i) => {
        if (char === " ") {
          return <span key={i} aria-hidden className="w-2" />;
        }

        const separator = SEPARATORS.has(char);

        return (
          <span
            key={i}
            aria-hidden
            className="flex min-w-3.5 flex-col items-center"
          >
            <span className="text-lg font-bold tracking-widest uppercase">
              {separator || reveal || given.has(i) ? char : " "}
            </span>

            <span
              className={cn(
                "h-px w-full",
                separator
                  ? "bg-transparent"
                  : !reveal && given.has(i)
                    ? "bg-primary"
                    : "bg-border",
              )}
            />
          </span>
        );
      })}

      {letters > 0 ? (
        <span
          aria-hidden
          className="mb-auto text-2xs font-medium text-muted-foreground"
        >
          {count(runs, separators)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The word broken into its runs of letters and whatever separated them.
 *
 * Taken from the same string the blanks are drawn from, which is the masked
 * word for a guesser and the real one for the drawer. Those two have the same
 * length and the same separators, and that is the whole reason this can be put
 * in front of somebody who has not guessed it yet.
 */
function shape(chars: string[]) {
  const runs: number[] = [];
  const separators: string[] = [];
  let run = 0;

  for (const char of chars) {
    if (!SEPARATORS.has(char)) {
      run++;
      continue;
    }
    runs.push(run);
    separators.push(char);
    run = 0;
  }
  runs.push(run);

  return { runs, separators };
}

function count(runs: number[], separators: string[]) {
  let out = String(runs[0]);
  for (let i = 1; i < runs.length; i++) out += separators[i - 1] + runs[i];
  return out;
}
