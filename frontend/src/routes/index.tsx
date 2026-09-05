import { createFileRoute } from "@tanstack/react-router";

import { PlayCard } from "#/components/home/play-card.tsx";
import { RoadmapMap } from "#/components/home/roadmap-map.tsx";
import { WordReveal } from "#/components/home/word-reveal.tsx";
import { Badge } from "#/components/ui/badge.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-10 overflow-hidden px-4 py-12">
      <header className="flex flex-col items-center gap-4">
        <h1 className="relative text-4xl font-semibold tracking-tight lowercase sm:text-5xl">
          scribble
          <Underline />
        </h1>
        <WordReveal />
      </header>

      <PlayCard />

      <footer className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
        <Stat>2&ndash;12 players</Stat>
        <Dot />
        <Stat>3 rounds</Stat>
        <Dot />
        <Stat>80 seconds a turn</Stat>
      </footer>

      <RoadmapMap />
    </main>
  );
}

/** One of the three facts under the card. */
function Stat({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground/70">{children}</span>;
}

/** Separator between them, in the theme colour so the row is not all grey. */
function Dot() {
  return <span aria-hidden className="bg-primary size-1 rounded-full" />;
}

/** Hand-drawn marker stroke under the wordmark. */
function Underline() {
  return (
    <svg
      aria-hidden
      role="presentation"
      viewBox="0 0 220 12"
      preserveAspectRatio="none"
      className="text-primary absolute -bottom-1 left-0 h-2.5 w-full"
    >
      <path
        d="M3 8C34 3 62 9 96 5s58 6 88 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
