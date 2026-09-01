import { createFileRoute } from "@tanstack/react-router";

import { PlayCard } from "#/components/home/play-card.tsx";
import { WordReveal } from "#/components/home/word-reveal.tsx";
import { Badge } from "#/components/ui/badge.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="relative flex min-h-svh flex-col items-center justify-center gap-10 overflow-hidden px-4 py-12">
			<GridBackdrop />

			<header className="flex flex-col items-center gap-4">
				<Badge variant="outline" className="tracking-widest uppercase">
					draw &middot; guess &middot; repeat
				</Badge>
				<h1 className="relative text-4xl font-semibold tracking-tight lowercase sm:text-5xl">
					scribble
					<Underline />
				</h1>
				<WordReveal />
			</header>

			<PlayCard />

			<footer className="text-muted-foreground text-xs">
				2&ndash;12 players &middot; 3 rounds &middot; 80 seconds a turn
			</footer>
		</main>
	);
}

/** Faint pencil-on-graph-paper grid, faded out toward the edges. */
function GridBackdrop() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
		/>
	);
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
