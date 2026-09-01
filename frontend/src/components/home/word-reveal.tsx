import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";

import { nearbyKey } from "#/lib/typos.ts";
import { WORDS } from "#/lib/words.ts";

const HOLD_SECONDS = 1.4;
/** Odds any single keystroke comes out wrong. */
const TYPO_CHANCE = 0.12;
/** Ceiling per word, so a long word never turns into a comedy of errors. */
const MAX_TYPOS = 2;
/** Beat between typing the wrong letter and noticing it. */
const TYPO_NOTICE = 0.28;
/** Beat between erasing and typing the right letter. */
const TYPO_RETYPE = 0.1;
/** How far the row travels as it rolls off the top / arrives from the bottom. */
const DRUM_RISE = 18;
/** Lower means a deeper, more barrel-like curve to the rotation. */
const DRUM_PERSPECTIVE = 420;

/**
 * Mimics the hint row from a live round. Each word arrives on a rotating drum,
 * its blanks draw in, a caret types it out (fumbling a key now and then), it
 * holds, then the whole row rolls up and away as the next word turns in below.
 */
export function WordReveal() {
	const [index, setIndex] = useState(0);
	const entry = WORDS[index % WORDS.length];
	// Split by code point, not UTF-16 unit, so a surrogate pair stays one slot.
	const chars = [...entry.word];
	const rtl = entry.dir === "rtl";

	const rootRef = useRef<HTMLDivElement>(null);
	const rowRef = useRef<HTMLDivElement>(null);
	const slotsRef = useRef<(HTMLSpanElement | null)[]>([]);
	const caretRef = useRef<HTMLSpanElement>(null);

	useGSAP(
		() => {
			const root = rootRef.current;
			const row = rowRef.current;
			const caret = caretRef.current;
			if (!root || !row || !caret) return;

			const slots = slotsRef.current
				.slice(0, chars.length)
				.filter((slot): slot is HTMLSpanElement => slot !== null);
			const bars = gsap.utils.toArray<HTMLElement>("[data-bar]", root);
			const letters = gsap.utils.toArray<HTMLElement>("[data-letter]", root);
			if (slots.length !== chars.length || letters.length !== chars.length)
				return;

			/**
			 * Where the caret sits before typing slot `i`. offsetLeft is measured
			 * from the left edge whatever the direction, so RTL just means starting
			 * at the slot's far side and walking the other way.
			 */
			const caretX = (i: number) => {
				const slot = slots[Math.min(i, slots.length - 1)];
				const leading = rtl
					? slot.offsetLeft + slot.offsetWidth
					: slot.offsetLeft;
				const trailing = rtl
					? slot.offsetLeft
					: slot.offsetLeft + slot.offsetWidth;
				return i < slots.length ? leading : trailing;
			};

			const advance = () => setIndex((current) => current + 1);

			gsap.matchMedia().add(
				{
					motion: "(prefers-reduced-motion: no-preference)",
					reduced: "(prefers-reduced-motion: reduce)",
				},
				(context) => {
					const { reduced } = context.conditions as { reduced: boolean };

					// Typos rewrite textContent in place and React will not diff that
					// back, so re-assert the real word before every pass. Done here
					// rather than in the timeline so it lands before the first paint.
					for (const [i, letter] of letters.entries()) {
						letter.textContent = chars[i];
					}

					if (reduced) {
						gsap.set(row, { opacity: 1, rotateX: 0, y: 0 });
						gsap.set(bars, { scaleX: 1 });
						gsap.set(letters, { opacity: 1, y: 0 });
						gsap.set(caret, { autoAlpha: 0 });
						gsap.delayedCall(HOLD_SECONDS + 1.2, advance);
						return;
					}

					// Applied synchronously: the timeline's own first tick lands a frame
					// after paint, which would flash the row in at rest.
					gsap.set(row, {
						opacity: 0,
						rotateX: -90,
						y: DRUM_RISE,
						transformPerspective: DRUM_PERSPECTIVE,
					});
					gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
					gsap.set(letters, { opacity: 0, y: 6 });
					gsap.set(caret, { autoAlpha: 0, x: caretX(0) });

					const tl = gsap.timeline({ onComplete: advance });

					// 1. The drum turns the new word up from below.
					tl.to(row, {
						opacity: 1,
						rotateX: 0,
						y: 0,
						duration: 0.5,
						ease: "power3.out",
					})
						// 2. Blanks draw themselves in, left to right.
						.to(
							bars,
							{
								scaleX: 1,
								duration: 0.3,
								ease: "power2.out",
								stagger: 0.045,
							},
							"-=0.18",
						)
						// 3. Caret shows up on the first blank.
						.to(caret, { autoAlpha: 1, duration: 0.15 }, ">-0.12");

					// 4. Type it out, caret leading each letter.
					const type = (letter: HTMLElement, i: number, gap: string) => {
						tl.to(
							letter,
							{ opacity: 1, y: 0, duration: 0.12, ease: "power2.out" },
							gap,
						).to(
							caret,
							{ x: caretX(i + 1), duration: 0.1, ease: "power2.out" },
							"<",
						);
					};

					let typos = 0;

					letters.forEach((letter, i) => {
						const wrong = nearbyKey(chars[i]);
						const slipped =
							wrong !== null &&
							typos < MAX_TYPOS &&
							Math.random() < TYPO_CHANCE;

						if (!slipped) {
							type(letter, i, "+=0.06");
							return;
						}

						typos += 1;

						// Hit the wrong key...
						tl.call(() => {
							letter.textContent = wrong;
						});
						type(letter, i, "+=0.06");

						// ...notice, and backspace over it.
						tl.to(
							letter,
							{ opacity: 0, duration: 0.08, ease: "power1.in" },
							`+=${TYPO_NOTICE}`,
						)
							.to(
								caret,
								{ x: caretX(i), duration: 0.1, ease: "power2.out" },
								"<",
							)
							.call(() => {
								letter.textContent = chars[i];
							})
							.set(letter, { y: 6 });

						// Then get it right.
						type(letter, i, `+=${TYPO_RETYPE}`);
					});

					// 5. Hold, then the drum carries the finished word up and away.
					tl.to(caret, { autoAlpha: 0, duration: 0.2 }, `+=${HOLD_SECONDS}`).to(
						row,
						{
							opacity: 0,
							rotateX: 90,
							y: -DRUM_RISE,
							duration: 0.45,
							ease: "power2.in",
						},
						">-0.05",
					);
				},
			);
		},
		{ scope: rootRef, dependencies: [entry.word] },
	);

	return (
		<div ref={rootRef} aria-hidden className="flex justify-center">
			<div
				ref={rowRef}
				lang={entry.lang}
				dir={entry.dir}
				className="relative flex items-end justify-center gap-1.5 text-sm font-medium tracking-widest opacity-0"
			>
				{chars.map((letter, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: letters are positional
						key={i}
						ref={(el) => {
							slotsRef.current[i] = el;
						}}
						className="flex min-w-3.5 flex-col items-center"
					>
						<span data-letter className="text-foreground uppercase opacity-0">
							{letter}
						</span>
						<span data-bar className="bg-border h-px w-full" />
					</span>
				))}

				<span
					ref={caretRef}
					className="pointer-events-none absolute bottom-0.5 left-0 opacity-0"
				>
					<span className="bg-primary animate-caret-blink motion-reduce:animate-none block h-4 w-0.5" />
				</span>
			</div>
		</div>
	);
}
