import {
	CheckIcon,
	LinkIcon,
	LogOutIcon,
	Volume2Icon,
	VolumeXIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { WordHint } from "#/components/room/word-hint.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { cn } from "#/lib/utils.ts";

/** Below this the ring and the count turn red. */
const LOW_SECONDS = 10;

type RoomHeaderProps = {
	code: string;
	round: number;
	totalRounds: number;
	secondsLeft: number;
	turnSeconds: number;
	word: string;
	revealed: number[];
	/** Whether the local player holds the pen this turn. */
	drawing: boolean;
	drawerName: string;
	onLeave?: () => void;
};

export function RoomHeader({
	code,
	round,
	totalRounds,
	secondsLeft,
	turnSeconds,
	word,
	revealed,
	drawing,
	drawerName,
	onLeave,
}: RoomHeaderProps) {
	const [muted, setMuted] = useState(false);

	return (
		<header className="grid grid-cols-2 items-center gap-3 rounded-lg bg-card px-3 py-2 text-card-foreground ring-1 ring-foreground/10 sm:grid-cols-[1fr_auto_1fr]">
			<div className="col-start-1 row-start-1 flex items-center gap-2.5">
				<TurnTimer secondsLeft={secondsLeft} turnSeconds={turnSeconds} />
				<div className="flex flex-col gap-0.5">
					<span className="text-xs font-medium">
						round {round}
						<span className="text-muted-foreground">/{totalRounds}</span>
					</span>
					<span className="text-muted-foreground truncate text-2xs">
						{drawing ? "your turn" : `${drawerName} is drawing`}
					</span>
				</div>
			</div>

			<div className="col-span-2 col-start-1 row-start-2 flex flex-col items-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
				<span className="text-muted-foreground text-2xs tracking-widest uppercase">
					{drawing ? "draw this" : "guess the word"}
				</span>
				<WordHint word={word} revealed={revealed} reveal={drawing} />
			</div>

			<div className="col-start-2 row-start-1 flex items-center justify-end gap-1 sm:col-start-3">
				<InviteButton code={code} />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-pressed={muted}
							aria-label={muted ? "Unmute sounds" : "Mute sounds"}
							onClick={() => setMuted((on) => !on)}
						>
							{muted ? <VolumeXIcon /> : <Volume2Icon />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{muted ? "unmute" : "mute"}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Leave the room"
							onClick={onLeave}
						>
							<LogOutIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>leave room</TooltipContent>
				</Tooltip>
			</div>
		</header>
	);
}

/**
 * Seconds left on the turn, wrapped in a ring that empties as they run out.
 * The ring eases linearly so it keeps pace with the count rather than
 * springing between ticks.
 */
function TurnTimer({
	secondsLeft,
	turnSeconds,
}: {
	secondsLeft: number;
	turnSeconds: number;
}) {
	const radius = 15;
	const circumference = 2 * Math.PI * radius;
	const left = Math.max(0, Math.min(1, secondsLeft / turnSeconds));
	const low = secondsLeft <= LOW_SECONDS;

	return (
		<div
			className="relative flex size-9 shrink-0 items-center justify-center"
			role="timer"
			aria-label={`${secondsLeft} seconds left this turn`}
		>
			<svg
				aria-hidden
				role="presentation"
				viewBox="0 0 36 36"
				className="absolute size-full -rotate-90"
			>
				<circle
					cx="18"
					cy="18"
					r={radius}
					fill="none"
					strokeWidth="2.5"
					className="stroke-border"
				/>
				<circle
					cx="18"
					cy="18"
					r={radius}
					fill="none"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={circumference * (1 - left)}
					className={cn(
						"transition-[stroke-dashoffset] duration-1000 ease-linear",
						low ? "stroke-destructive" : "stroke-primary",
					)}
				/>
			</svg>
			<span
				className={cn(
					"text-xs font-medium tabular-nums",
					low && "text-destructive",
				)}
			>
				{secondsLeft}
			</span>
		</div>
	);
}

/** Room code that copies a join link to the clipboard when clicked. */
function InviteButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	// Reset the tick a moment after the copy so the button settles back.
	useEffect(() => {
		if (!copied) return;
		const id = setTimeout(() => setCopied(false), 1600);
		return () => clearTimeout(id);
	}, [copied]);

	async function copy() {
		await navigator.clipboard.writeText(window.location.href);
		setCopied(true);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="sm" onClick={copy}>
					{copied ? (
						<CheckIcon data-icon="inline-start" className="text-primary" />
					) : (
						<LinkIcon data-icon="inline-start" />
					)}
					<Badge variant="outline" className="tracking-[0.2em] uppercase">
						{code}
					</Badge>
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{copied ? "link copied" : "copy invite link"}
			</TooltipContent>
		</Tooltip>
	);
}
